import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

// How many emails to fully process per run. Change this to scan more or fewer emails.
const SCAN_CAP = 50;

// How many pages of Gmail search results to fetch (50 per page = up to 500 IDs total).
const MAX_ID_PAGES = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractBody(payload: any, depth = 0): string {
  if (!payload || depth > 5) return '';
  const decode = (data: string) =>
    atob(data.replace(/-/g, '+').replace(/_/g, '/'));

  if (payload.body?.data && !payload.parts) {
    const raw = decode(payload.body.data);
    if (payload.mimeType === 'text/plain') return raw;
    if (payload.mimeType === 'text/html')
      return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const parts: any[] = payload.parts ?? [];
  for (const part of parts)
    if (part.mimeType === 'text/plain' && part.body?.data)
      return decode(part.body.data);
  for (const part of parts)
    if (part.mimeType?.startsWith('multipart/')) {
      const t = extractBody(part, depth + 1);
      if (t.length > 20) return t;
    }
  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data)
      return decode(part.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (part.mimeType?.startsWith('multipart/')) {
      const t = extractBody(part, depth + 1);
      if (t.length > 20) return t;
    }
  }
  if (payload.body?.data) return decode(payload.body.data);
  return '';
}

function headerValue(payload: any, name: string): string {
  const headers: any[] = payload?.headers ?? [];
  return headers.find((h) => h?.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  return Array.from(new Set(matches.map((u) => u.replace(/[.,;!?]+$/, '')))).slice(0, 10);
}

function toIsoTimestamp(internalDate: unknown): string | null {
  const ms = Number(internalDate);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}

// Builds a Gmail search query the user can paste to find a specific email.
function gmailSearchHint(from: string, internalDate: string): string {
  const emailMatch = from.match(/<([^>]+)>/);
  const sender = emailMatch ? emailMatch[1] : from.replace(/[<>]/g, '').trim();
  const ms = Number(internalDate);
  if (!Number.isFinite(ms) || ms <= 0) return sender ? `from:(${sender})` : '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
  const date = new Date(ms);
  const before = new Date(ms); before.setDate(before.getDate() + 2);
  return `from:(${sender}) after:${fmt(date)} before:${fmt(before)}`;
}

// Run async tasks in parallel batches of `size`, serially between batches.
async function runBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = await Promise.all(items.slice(i, i + size).map(fn));
    results.push(...batch);
  }
  return results;
}

// ─── Header-level receipt filter ─────────────────────────────────────────────

const RECEIPT_SUBJECT_KEYWORDS = [
  'receipt', 'invoice', 'order', 'payment', 'booking', 'reservation',
  'confirmation', 'tax invoice', 'bill', 'purchase', 'transaction',
  'delivered', 'shipment', 'your order', 'order details',
];

const RECEIPT_FROM_PATTERNS = [
  'receipt', 'invoice', 'orders', 'billing', 'payment',
  'noreply', 'no-reply', 'donotreply', 'do-not-reply',
  'notifications', 'confirm', 'booking',
];

function looksLikeReceipt(subject: string, from: string): boolean {
  const s = subject.toLowerCase();
  const f = from.toLowerCase();
  return (
    RECEIPT_SUBJECT_KEYWORDS.some((kw) => s.includes(kw)) ||
    RECEIPT_FROM_PATTERNS.some((p) => f.includes(p))
  );
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader?.replace('Bearer ', '') ?? ''
  );
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let reqBody: Record<string, unknown>;
  try { reqBody = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { access_token } = reqBody;
  const lookback_days = Math.min(Math.max(Number(reqBody.lookback_days) || 60, 1), 365);
  if (typeof access_token !== 'string' || access_token.length < 20) {
    return new Response(JSON.stringify({ error: 'Invalid access token' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Phase 1: Collect all matching Gmail message IDs (newest first) ────────
  // Search only Inbox + Updates — that's where receipts actually land.
  // Promotions/Social are excluded.
  const q = encodeURIComponent(
    `newer_than:${lookback_days}d (label:inbox OR label:updates) ` +
    `(subject:(receipt OR invoice OR "order confirmation" OR "tax invoice" OR "payment confirmation" OR "your order" OR "order details" OR booking OR reservation OR delivered OR shipment) OR ` +
    `from:(receipt OR invoice OR orders OR billing OR payment OR noreply OR no-reply OR donotreply OR do-not-reply OR notifications OR confirm OR booking))`
  );

  const allIds: string[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_ID_PAGES; page++) {
    const url =
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=50` +
      (pageToken ? `&pageToken=${pageToken}` : '');
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => resp.status.toString());
      return new Response(JSON.stringify({ error: `Gmail API error: ${errBody}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const data = await resp.json();
    for (const m of data.messages ?? []) allIds.push(m.id);
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  if (allIds.length === 0) {
    return new Response(JSON.stringify({ imported: 0, link_only: [], already_scanned: 0, remaining: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Phase 2: Batch dedup against scan history ─────────────────────────────
  const { data: scanned } = await supabase
    .from('email_scan_history')
    .select('email_message_id')
    .eq('user_id', user.id)
    .in('email_message_id', allIds);

  const scannedIds = new Set((scanned ?? []).map((r: any) => r.email_message_id));
  const already_scanned = scannedIds.size;

  // Gmail returns newest first — reverse so we process oldest unseen first
  const unseenIds = allIds.filter((id) => !scannedIds.has(id)).reverse();

  if (unseenIds.length === 0) {
    return new Response(
      JSON.stringify({ imported: 0, link_only: [], already_scanned, remaining: 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Take the oldest SCAN_CAP emails to process this run
  const toProcess = unseenIds.slice(0, SCAN_CAP);
  const remaining = Math.max(0, unseenIds.length - SCAN_CAP);

  // ── Phase 3: Fetch metadata (headers only) in parallel ────────────────────
  type MsgMeta = { id: string; subject: string; from: string; internalDate: string };

  const metaResults = await runBatches<string, MsgMeta | null>(
    toProcess,
    20,
    async (id) => {
      try {
        const resp = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}` +
            `?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        if (!resp.ok) return null;
        const data = await resp.json();
        return {
          id,
          subject: headerValue(data.payload, 'Subject'),
          from: headerValue(data.payload, 'From'),
          internalDate: String(data.internalDate ?? ''),
        };
      } catch { return null; }
    }
  );

  // Keep only emails whose headers look like receipts — skip the rest silently
  const candidates = metaResults.filter(
    (m): m is MsgMeta => m !== null && looksLikeReceipt(m.subject, m.from)
  );

  // ── Phase 4: Full fetch + Claude in parallel batches of 8 ─────────────────
  type ProcessResult =
    | { kind: 'imported' }
    | { kind: 'link_only'; subject: string; from_address: string; received_at: string | null; gmail_search: string; message_id: string }
    | { kind: 'skip' };

  const processResults = await runBatches<MsgMeta, ProcessResult>(
    candidates,
    8,
    async (meta) => {
      try {
        const msgResp = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${meta.id}?format=full`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        if (!msgResp.ok) return { kind: 'skip' };
        const msgData = await msgResp.json();

        const emailBody = extractBody(msgData.payload);
        if (!emailBody || emailBody.length < 20) return { kind: 'skip' };

        const rfc822MessageId = headerValue(msgData.payload, 'Message-ID').replace(/[<>]/g, '').trim();
        const urls = extractUrls(emailBody);
        const receivedAt = toIsoTimestamp(msgData.internalDate ?? meta.internalDate);

        const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 512,
            messages: [{
              role: 'user',
              content:
                `Extract receipt/purchase data from this email. Includes purchase receipts, delivery confirmations with a total paid, booking/hotel confirmations with a total charged, subscription payments, and any email recording money spent. Return ONLY valid JSON or the word null if no money was actually charged.\n\n` +
                `JSON format:\n{"merchant_name":"string","date":"YYYY-MM-DD","total_amount":number,"currency":"3-letter code","category":"one of: Food & Drink, Transport, Tools & Materials, Office, Clothing, Health, Entertainment, Accommodation, Utilities, Other","line_items":[{"description":"string","amount":number}]}\n\n` +
                `From: ${meta.from}\nSubject: ${meta.subject}\nBody:\n${emailBody.slice(0, 4000)}`,
            }],
          }),
        });

        if (!claudeResp.ok) return urls.length > 0 ? { kind: 'link_only', message_id: meta.id, subject: meta.subject, from_address: meta.from, received_at: receivedAt, gmail_search: gmailSearchHint(meta.from, meta.internalDate) } : { kind: 'skip' };
        const claudeData = await claudeResp.json();
        const rawText = (claudeData.content?.[0]?.text ?? '').trim();
        const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

        // Strategy 1: Claude extracted a valid receipt — insert it
        if (cleaned && cleaned !== 'null' && cleaned.startsWith('{')) {
          let receipt: Record<string, unknown> | undefined;
          try { receipt = JSON.parse(cleaned); } catch { /* fall through to strategy 2 check */ }

          if (receipt && receipt.merchant_name && receipt.total_amount) {
            const baseInsert = {
              user_id: user.id,
              source: 'email_agent',
              merchant_name: String(receipt.merchant_name),
              date: receipt.date ?? new Date().toISOString().slice(0, 10),
              total_amount: Number(receipt.total_amount) || 0,
              currency: String(receipt.currency ?? 'AUD'),
              category: receipt.category ?? null,
              is_business: false,
              line_items: Array.isArray(receipt.line_items) ? receipt.line_items : [],
              email_source: meta.from || null,
              email_subject: meta.subject || null,
              email_received_at: receivedAt,
              email_message_id: meta.id,
              email_rfc822_message_id: rfc822MessageId || null,
              attachment_type: 'none',
              raw_text: null,
            };

            // Fallback inserts if schema is behind on optional columns
            const { email_subject: _es, email_received_at: _er, email_rfc822_message_id: _ri, ...withoutOptional } = baseInsert;
            const { email_message_id: _mi, ...withoutMessageId } = withoutOptional;
            const columnPattern = /\bemail_(?:subject|received_at|rfc822_message_id|message_id)\b/;
            let insertErr: any = null;
            for (const payload of [baseInsert, withoutOptional, withoutMessageId]) {
              const { error } = await supabase.from('receipts').insert(payload);
              insertErr = error;
              if (!error || error.code === '23505') break;
              if (!columnPattern.test(String(error.message ?? ''))) break;
            }

            if (!insertErr || insertErr.code === '23505') return { kind: 'imported' };
          }
        }

        // Strategy 2: Claude couldn't extract enough info but the email has
        // URLs — likely a receipt link the user needs to download manually.
        if (urls.length > 0) {
          return {
            kind: 'link_only',
            message_id: meta.id,
            subject: meta.subject,
            from_address: meta.from,
            received_at: receivedAt,
            gmail_search: gmailSearchHint(meta.from, meta.internalDate),
          };
        }

        // Not a receipt — silently skip
        return { kind: 'skip' };
      } catch { return { kind: 'skip' }; }
      finally {
        // Mark as scanned immediately so a timeout mid-batch doesn't cause re-processing
        await supabase.from('email_scan_history').upsert(
          [{ user_id: user.id, email_message_id: meta.id }],
          { onConflict: 'user_id,email_message_id', ignoreDuplicates: true }
        ).then(() => {});
      }
    }
  );

  // ── Phase 5: Mark metadata-fetched emails as scanned ─────────────────────
  // Write in two batches: (a) emails that didn't pass the header filter (cheap
  // to mark now), (b) emails that were fully processed (already marked inline).
  // This ensures scan history is written even if the function times out mid-run.
  const metaScanned = toProcess.filter(
    (id) => !candidates.some((c) => c.id === id)
  );
  if (metaScanned.length > 0) {
    await supabase.from('email_scan_history').upsert(
      metaScanned.map((id) => ({ user_id: user.id, email_message_id: id })),
      { onConflict: 'user_id,email_message_id', ignoreDuplicates: true }
    );
  }

  let imported = 0;
  const link_only: Array<{
    message_id: string;
    subject: string;
    from_address: string;
    received_at: string | null;
    gmail_search: string;
  }> = [];

  for (const r of processResults) {
    if (r.kind === 'imported') imported++;
    else if (r.kind === 'link_only') link_only.push({
      message_id: r.message_id,
      subject: r.subject,
      from_address: r.from_address,
      received_at: r.received_at,
      gmail_search: r.gmail_search,
    });
  }

  return new Response(
    JSON.stringify({ imported, link_only, already_scanned, remaining }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

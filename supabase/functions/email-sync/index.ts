import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

// Recursively walk MIME parts to extract readable text.
// Prefers text/plain; falls back to text/html with tags stripped.
function extractBody(payload: any, depth = 0): string {
  if (!payload || depth > 5) return '';

  const decode = (data: string) =>
    atob(data.replace(/-/g, '+').replace(/_/g, '/'));

  // Leaf node with data
  if (payload.body?.data && !payload.parts) {
    const raw = decode(payload.body.data);
    if (payload.mimeType === 'text/plain') return raw;
    if (payload.mimeType === 'text/html') {
      return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  const parts: any[] = payload.parts ?? [];

  // First pass: prefer text/plain at any level
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return decode(part.body.data);
    }
  }

  // Second pass: recurse into multipart containers
  for (const part of parts) {
    if (part.mimeType?.startsWith('multipart/')) {
      const text = extractBody(part, depth + 1);
      if (text.length > 20) return text;
    }
  }

  // Third pass: fall back to HTML
  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      const html = decode(part.body.data);
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    if (part.mimeType?.startsWith('multipart/')) {
      const text = extractBody(part, depth + 1);
      if (text.length > 20) return text;
    }
  }

  // Last resort: root body data
  if (payload.body?.data) {
    return decode(payload.body.data);
  }

  return '';
}

function headerValue(payload: any, name: string): string {
  const headers: any[] = payload?.headers ?? [];
  return headers.find((h) => h?.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
  const cleaned = matches.map((u) => u.replace(/[.,;!?]+$/, ''));
  return Array.from(new Set(cleaned)).slice(0, 10);
}

function toIsoTimestamp(internalDate: unknown): string | null {
  const epochMs = Number(internalDate);
  if (!Number.isFinite(epochMs) || epochMs <= 0) return null;
  return new Date(epochMs).toISOString();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: { user }, error: authErr } = await supabase.auth.getUser(
    authHeader?.replace('Bearer ', '') ?? ''
  );
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const { access_token } = body;
  if (typeof access_token !== 'string' || access_token.length < 20) {
    return new Response(JSON.stringify({ error: 'Invalid access token' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Fetch the 50 newest receipt-related emails from the last 6 months.
  // Broad subject + from filters so delivery apps (Uber Eats, DoorDash),
  // booking sites (Booking.com), and standard receipts are all included.
  // Claude then decides per-email whether it's actually a purchase receipt.
  const searchQuery = encodeURIComponent(
    `newer_than:180d (` +
    `subject:(receipt OR invoice OR confirmation OR booking OR payment OR "your order" OR "order details" OR delivered OR "tax invoice" OR reservation) OR ` +
    `from:(noreply OR no-reply OR donotreply OR do-not-reply OR receipt OR invoice OR orders OR billing OR booking OR payment OR notifications OR confirm OR support)` +
    `)`
  );

  const listResp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${searchQuery}&maxResults=50`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  if (!listResp.ok) {
    const errBody = await listResp.text().catch(() => listResp.status.toString());
    return new Response(JSON.stringify({ error: `Gmail API error: ${errBody}` }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const listData = await listResp.json();
  const messages = listData.messages ?? [];

  let imported = 0;
  let skipped = 0;

  for (const msg of messages) {
    try {
      const msgResp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${access_token}` } }
      );
      const msgData = await msgResp.json();

      const body = extractBody(msgData.payload);
      if (!body || body.length < 20) { skipped++; continue; }

      const subject = headerValue(msgData.payload, 'Subject');
      const from = headerValue(msgData.payload, 'From');
      const rfc822MessageId = headerValue(msgData.payload, 'Message-ID').replace(/[<>]/g, '').trim();
      const urls = extractUrls(body);
      const receivedAt = toIsoTimestamp(msgData.internalDate);

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
            content: `Extract receipt/purchase data from this email. This includes purchase receipts, delivery confirmations with a total paid, booking/hotel confirmations with a total amount charged, subscription payments, and any email that records money spent. Return ONLY valid JSON or the word null if no money was actually charged (e.g. marketing emails, delivery notifications without a total, promotional emails).

JSON format:
{"merchant_name":"string","date":"YYYY-MM-DD","total_amount":number,"currency":"3-letter code","category":"one of: Food & Drink, Transport, Tools & Materials, Office, Clothing, Health, Entertainment, Accommodation, Utilities, Other","line_items":[{"description":"string","amount":number}]}

From: ${from}
Subject: ${subject}
Body:
${body.slice(0, 4000)}`,
          }],
        }),
      });
      const claudeData = await claudeResp.json();
      const text = (claudeData.content?.[0]?.text ?? '').trim();
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

      if (!cleaned || cleaned === 'null' || !cleaned.startsWith('{')) { skipped++; continue; }

      let receipt: Record<string, unknown>;
      try { receipt = JSON.parse(cleaned); } catch { skipped++; continue; }

      if (!receipt.merchant_name || !receipt.total_amount) { skipped++; continue; }

      const baseInsert = {
        user_id: user.id,
        source: 'email_agent',
        merchant_name: String(receipt.merchant_name ?? 'Unknown'),
        date: receipt.date ?? new Date().toISOString().slice(0, 10),
        total_amount: Number(receipt.total_amount ?? 0) || 0,
        currency: String(receipt.currency ?? 'AUD'),
        category: receipt.category ?? null,
        is_business: false,
        line_items: Array.isArray(receipt.line_items) ? receipt.line_items : [],
        email_source: from || null,
        email_subject: subject || null,
        email_received_at: receivedAt,
        email_message_id: msg.id,
        email_rfc822_message_id: rfc822MessageId || null,
        attachment_type: urls.length > 0 ? 'link_only' : 'none',
        raw_text: null,
      };

      // Dedup check before any insert — prevents duplicates when a fallback omits email_message_id
      const { data: dup } = await supabase
        .from('receipts')
        .select('id')
        .eq('user_id', user.id)
        .eq('email_message_id', msg.id)
        .maybeSingle();
      if (dup) { skipped++; continue; }

      // Try inserting, stripping optional email columns one batch at a time if schema is behind
      const insertAttempts = [
        baseInsert,
        { ...baseInsert, email_subject: undefined, email_received_at: undefined, email_rfc822_message_id: undefined },
        { ...baseInsert, email_subject: undefined, email_received_at: undefined, email_rfc822_message_id: undefined, email_message_id: undefined },
      ];
      const columnPattern = /\bemail_(?:subject|received_at|rfc822_message_id|message_id)\b/;
      let insertErr: any = null;
      for (const payload of insertAttempts) {
        const { error } = await supabase.from('receipts').insert(payload);
        insertErr = error;
        if (!error || error.code === '23505') break;
        if (!columnPattern.test(String(error.message ?? ''))) break;
      }

      if (insertErr?.code === '23505') { skipped++; }
      else if (!insertErr) { imported++; }
      else { skipped++; }

    } catch { skipped++; }
  }

  return new Response(JSON.stringify({ imported, skipped }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

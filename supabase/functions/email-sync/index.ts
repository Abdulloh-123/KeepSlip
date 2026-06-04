import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

const SCAN_CAP = 50;
const MAX_ID_PAGES = 10;

type ReceiptData = {
  merchant_name: string;
  date: string;
  total_amount: number;
  currency: string;
  category: string | null;
  line_items: Array<{ description: string; amount: number }>;
};

type MsgMeta = {
  id: string;
  subject: string;
  from: string;
  internalDate: string;
};

type AttachmentCandidate = {
  filename: string;
  mimeType: string;
  attachmentId: string | null;
  inlineData: string | null;
};

type ProcessResult =
  | { kind: 'imported'; receipt_id: string; message_id: string }
  | { kind: 'link_only'; receipt_id: string; message_id: string }
  | { kind: 'attention'; pending_id: string; message_id: string }
  | { kind: 'skip'; message_id: string }
  | { kind: 'retry'; message_id: string };

function decodeBase64UrlToString(data: string): string {
  return atob(data.replace(/-/g, '+').replace(/_/g, '/'));
}

function decodeBase64UrlToBytes(data: string): Uint8Array {
  const binary = decodeBase64UrlToString(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

function cleanHtml(raw: string): string {
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractBody(payload: any, depth = 0): string {
  if (!payload || depth > 5) return '';

  if (payload.body?.data && !payload.parts) {
    const raw = decodeBase64UrlToString(payload.body.data);
    if (payload.mimeType === 'text/plain') return raw;
    if (payload.mimeType === 'text/html') return cleanHtml(raw);
  }

  const parts: any[] = payload.parts ?? [];
  for (const part of parts) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return decodeBase64UrlToString(part.body.data);
    }
  }
  for (const part of parts) {
    if (part.mimeType?.startsWith('multipart/')) {
      const text = extractBody(part, depth + 1);
      if (text.length > 20) return text;
    }
  }
  for (const part of parts) {
    if (part.mimeType === 'text/html' && part.body?.data) {
      return cleanHtml(decodeBase64UrlToString(part.body.data));
    }
    if (part.mimeType?.startsWith('multipart/')) {
      const text = extractBody(part, depth + 1);
      if (text.length > 20) return text;
    }
  }
  if (payload.body?.data) return decodeBase64UrlToString(payload.body.data);
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

function gmailSearchHint(from: string, internalDate: string, subject: string): string {
  const emailMatch = from.match(/<([^>]+)>/);
  const sender = emailMatch ? emailMatch[1] : from.replace(/[<>]/g, '').trim();
  const parts: string[] = [];
  if (sender) parts.push(`from:${sender}`);
  const ms = Number(internalDate);
  if (Number.isFinite(ms) && ms > 0) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
    const date = new Date(ms);
    const before = new Date(ms);
    before.setDate(before.getDate() + 2);
    parts.push(`after:${fmt(date)}`, `before:${fmt(before)}`);
  }
  if (!parts.length && subject) parts.push(subject.slice(0, 80));
  return parts.join(' ');
}

async function runBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = await Promise.all(items.slice(i, i + size).map(fn));
    results.push(...batch);
  }
  return results;
}

async function findReceiptIdForEmail(
  supabase: any,
  userId: string,
  emailMessageId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('receipts')
    .select('id')
    .eq('user_id', userId)
    .eq('email_message_id', emailMessageId)
    .maybeSingle();
  return (data as any)?.id ?? null;
}

const RECEIPT_SUBJECT_KEYWORDS = [
  'receipt', 'e-receipt', 'ereceipt', 'invoice', 'tax invoice', 'tax receipt',
  'tax summary', 'order', 'order confirmation', 'order details', 'order received',
  'thanks for your order', 'payment', 'payment confirmation', 'payment received',
  'paid', 'purchase', 'purchase confirmation', 'proof of purchase', 'transaction',
  'bill', 'billing', 'statement', 'subscription', 'booking', 'reservation',
  'itinerary', 'ticket', 'fare', 'delivered', 'delivery confirmation', 'shipment',
  'shipped', 'GST', 'VAT',
];

const RECEIPT_FROM_PATTERNS = [
  'receipt', 'invoice', 'orders', 'order', 'billing', 'payment', 'payments',
  'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'notifications',
  'confirm', 'confirmation', 'booking', 'reservation', 'sales', 'store',
  'shop', 'accounts', 'statement',
];

function looksLikeReceipt(subject: string, from: string): boolean {
  const s = subject.toLowerCase();
  const f = from.toLowerCase();
  return (
    RECEIPT_SUBJECT_KEYWORDS.some((kw) => s.includes(kw.toLowerCase())) ||
    RECEIPT_FROM_PATTERNS.some((p) => f.includes(p))
  );
}

function quoteSearchTerm(term: string): string {
  return /[^a-z0-9_-]/i.test(term) ? `"${term}"` : term;
}

function inferredMimeType(filename: string, mimeType: string): string {
  const lower = filename.toLowerCase();
  if (mimeType?.startsWith('image/') || mimeType === 'application/pdf') return mimeType;
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return mimeType;
}

function isSupportedAttachment(filename: string, mimeType: string): boolean {
  const type = inferredMimeType(filename, mimeType);
  return type === 'application/pdf' || type.startsWith('image/');
}

function collectAttachmentCandidates(payload: any, out: AttachmentCandidate[] = []): AttachmentCandidate[] {
  if (!payload) return out;
  const filename = String(payload.filename ?? '');
  const mimeType = inferredMimeType(filename, String(payload.mimeType ?? ''));
  const attachmentId = payload.body?.attachmentId ? String(payload.body.attachmentId) : null;
  const inlineData = payload.body?.data ? String(payload.body.data) : null;

  if (filename && isSupportedAttachment(filename, mimeType) && (attachmentId || inlineData)) {
    out.push({ filename, mimeType, attachmentId, inlineData });
  }

  for (const part of payload.parts ?? []) collectAttachmentCandidates(part, out);
  return out;
}

function extensionFor(filename: string, mimeType: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.png')) return 'png';
  if (lower.endsWith('.webp')) return 'webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

async function downloadAttachmentBytes(
  accessToken: string,
  messageId: string,
  attachment: AttachmentCandidate
): Promise<Uint8Array | null> {
  if (attachment.inlineData) return decodeBase64UrlToBytes(attachment.inlineData);
  if (!attachment.attachmentId) return null;

  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachment.attachmentId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) return null;
  const data = await resp.json();
  return typeof data.data === 'string' ? decodeBase64UrlToBytes(data.data) : null;
}

async function uploadAttachment(
  supabase: any,
  userId: string,
  messageId: string,
  attachment: AttachmentCandidate,
  bytes: Uint8Array
): Promise<string | null> {
  const ext = extensionFor(attachment.filename, attachment.mimeType);
  const safeMessageId = messageId.replace(/[^a-zA-Z0-9_-]/g, '');
  const path = `${userId}/${Date.now()}-${safeMessageId}.${ext}`;
  const { error } = await supabase.storage.from('receipts').upload(path, bytes, {
    contentType: attachment.mimeType,
    upsert: false,
  });
  return error ? null : path;
}

async function callClaude(body: Record<string, unknown>): Promise<any | null> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const rawText = (data.content?.[0]?.text ?? '').trim();
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  if (!cleaned || cleaned === 'null') return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function normalizeReceipt(raw: Record<string, unknown>, fallbackDate: string | null): ReceiptData | null {
  const merchant = String(raw.merchant_name ?? '').trim();
  const amount = Number(raw.total_amount);
  if (!merchant || !Number.isFinite(amount) || amount <= 0) return null;
  const date = String(raw.date ?? fallbackDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  return {
    merchant_name: merchant,
    date,
    total_amount: amount,
    currency: String(raw.currency ?? 'AUD').slice(0, 3).toUpperCase(),
    category: raw.category ? String(raw.category) : null,
    line_items: Array.isArray(raw.line_items) ? raw.line_items as ReceiptData['line_items'] : [],
  };
}

async function parseReceiptAttachment(
  bytes: Uint8Array,
  mimeType: string,
  fallbackDate: string | null
): Promise<ReceiptData | null> {
  const prompt = `Extract receipt or invoice data from this attached receipt file. Return ONLY valid JSON with this shape:
{"merchant_name":"string","date":"YYYY-MM-DD","total_amount":number,"currency":"3-letter code","category":"one of: Food & Drink, Transport, Tools & Materials, Office, Clothing, Health, Entertainment, Accommodation, Utilities, Other","line_items":[{"description":"string","amount":number}]}
If this file is not a receipt or invoice, return null.`;

  const contentBlock = mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: mimeType, data: bytesToBase64(bytes) } }
    : { type: 'image', source: { type: 'base64', media_type: mimeType, data: bytesToBase64(bytes) } };

  const parsed = await callClaude({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }],
  });

  return parsed && typeof parsed === 'object'
    ? normalizeReceipt(parsed as Record<string, unknown>, fallbackDate)
    : null;
}

async function classifyEmailBody(
  meta: MsgMeta,
  emailBody: string,
  urls: string[],
  fallbackDate: string | null
): Promise<{ status: string; receipt: ReceiptData | null; merchant_hint: string | null; reason: string | null } | null> {
  const parsed = await callClaude({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 768,
    messages: [{
      role: 'user',
      content:
        `Classify this email for a receipt import app. Return ONLY valid JSON.\n\n` +
        `If the email text contains enough receipt data, return:\n` +
        `{"status":"receipt","merchant_name":"string","date":"YYYY-MM-DD","total_amount":number,"currency":"3-letter code","category":"one of: Food & Drink, Transport, Tools & Materials, Office, Clothing, Health, Entertainment, Accommodation, Utilities, Other","line_items":[{"description":"string","amount":number}]}\n\n` +
        `If the email appears to contain a receipt behind a link but does NOT include enough text to create a receipt, return:\n` +
        `{"status":"link_needs_attention","merchant_hint":"string or null","reason":"short string"}\n\n` +
        `If it is not a receipt/purchase/payment record, return {"status":"not_receipt"}.\n\n` +
        `Only use link_needs_attention when a user should open a link in the email to download a receipt.\n\n` +
        `From: ${meta.from}\nSubject: ${meta.subject}\nLinks found: ${urls.length}\nBody:\n${emailBody.slice(0, 4500)}`,
    }],
  });

  if (!parsed || typeof parsed !== 'object') return null;
  const raw = parsed as Record<string, unknown>;
  const status = String(raw.status ?? '');
  const receipt = status === 'receipt' ? normalizeReceipt(raw, fallbackDate) : null;
  return {
    status,
    receipt,
    merchant_hint: raw.merchant_hint ? String(raw.merchant_hint) : null,
    reason: raw.reason ? String(raw.reason) : null,
  };
}

async function insertReceiptForEmail(
  supabase: any,
  userId: string,
  meta: MsgMeta,
  msgData: any,
  receipt: ReceiptData,
  attachmentType: 'none' | 'pdf' | 'image' | 'link_only',
  storagePath: string | null
): Promise<string | null> {
  const rfc822MessageId = headerValue(msgData.payload, 'Message-ID').replace(/[<>]/g, '').trim();
  const receivedAt = toIsoTimestamp(msgData.internalDate ?? meta.internalDate);
  const baseInsert = {
    user_id: userId,
    source: 'email_agent',
    merchant_name: receipt.merchant_name,
    date: receipt.date,
    total_amount: receipt.total_amount,
    currency: receipt.currency,
    category: receipt.category,
    is_business: false,
    line_items: receipt.line_items,
    image_url: attachmentType === 'image' ? storagePath : null,
    pdf_url: attachmentType === 'pdf' ? storagePath : null,
    email_source: meta.from || null,
    email_subject: meta.subject || null,
    email_received_at: receivedAt,
    email_message_id: meta.id,
    email_rfc822_message_id: rfc822MessageId || null,
    attachment_type: attachmentType,
    raw_text: null,
  };

  const { email_subject: _es, email_received_at: _er, email_rfc822_message_id: _ri, ...withoutOptional } = baseInsert;
  const { email_message_id: _mi, ...withoutMessageId } = withoutOptional;
  const columnPattern = /\bemail_(?:subject|received_at|rfc822_message_id|message_id)\b/;
  let insertErr: any = null;
  let insertedId: string | null = null;

  for (const payload of [baseInsert, withoutOptional, withoutMessageId]) {
    const { data, error } = await supabase
      .from('receipts')
      .insert(payload as any)
      .select('id')
      .single();
    insertErr = error;
    insertedId = (data as any)?.id ?? null;
    if (!error || error.code === '23505') break;
    if (!columnPattern.test(String(error.message ?? ''))) break;
  }

  if (insertErr?.code === '23505') {
    insertedId = await findReceiptIdForEmail(supabase, userId, meta.id);
  }

  return insertedId;
}

async function upsertPendingEmailReceipt(
  supabase: any,
  userId: string,
  meta: MsgMeta,
  msgData: any,
  merchantHint: string | null,
  reason: string | null
): Promise<string | null> {
  const rfc822MessageId = headerValue(msgData.payload, 'Message-ID').replace(/[<>]/g, '').trim();
  const receivedAt = toIsoTimestamp(msgData.internalDate ?? meta.internalDate);
  const { data, error } = await supabase
    .from('pending_email_receipts')
    .upsert({
      user_id: userId,
      email_message_id: meta.id,
      email_rfc822_message_id: rfc822MessageId || null,
      email_subject: meta.subject || null,
      email_source: meta.from || null,
      email_received_at: receivedAt,
      gmail_search: gmailSearchHint(meta.from, String(msgData.internalDate ?? meta.internalDate), meta.subject),
      merchant_hint: merchantHint,
      reason: reason ?? 'Receipt is behind a link and the email text does not include enough details.',
      status: 'unresolved',
      resolved_at: null,
    } as any, { onConflict: 'user_id,email_message_id' })
    .select('id')
    .single();
  return error ? null : (data as any)?.id ?? null;
}

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
  try {
    reqBody = await req.json();
  } catch {
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

  const subjectTerms = RECEIPT_SUBJECT_KEYWORDS.map(quoteSearchTerm).join(' OR ');
  const fromTerms = RECEIPT_FROM_PATTERNS.map(quoteSearchTerm).join(' OR ');
  const q = encodeURIComponent(
    `newer_than:${lookback_days}d (label:inbox OR label:updates) ` +
    `(subject:(${subjectTerms}) OR from:(${fromTerms}))`
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
    return new Response(JSON.stringify({
      imported: 0,
      imported_receipt_ids: [],
      link_only_receipt_ids: [],
      pending_email_receipt_ids: [],
      processed: 0,
      skipped: 0,
      already_scanned: 0,
      remaining: 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: scanned } = await supabase
    .from('email_scan_history')
    .select('email_message_id')
    .eq('user_id', user.id)
    .in('email_message_id', allIds);

  const scannedIds = new Set((scanned ?? []).map((r: any) => r.email_message_id));
  const already_scanned = scannedIds.size;
  const unseenIds = allIds.filter((id) => !scannedIds.has(id)).reverse();

  if (unseenIds.length === 0) {
    return new Response(JSON.stringify({
      imported: 0,
      imported_receipt_ids: [],
      link_only_receipt_ids: [],
      pending_email_receipt_ids: [],
      processed: 0,
      skipped: 0,
      already_scanned,
      remaining: 0,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const toProcess = unseenIds.slice(0, SCAN_CAP);
  const remaining = Math.max(0, unseenIds.length - SCAN_CAP);

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
      } catch {
        return null;
      }
    }
  );

  const candidates = metaResults.filter(
    (m): m is MsgMeta => m !== null && looksLikeReceipt(m.subject, m.from)
  );

  const processResults = await runBatches<MsgMeta, ProcessResult>(
    candidates,
    8,
    async (meta) => {
      try {
        const msgResp = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${meta.id}?format=full`,
          { headers: { Authorization: `Bearer ${access_token}` } }
        );
        if (!msgResp.ok) return { kind: 'retry', message_id: meta.id };

        const msgData = await msgResp.json();
        const receivedAt = toIsoTimestamp(msgData.internalDate ?? meta.internalDate);
        const attachments = collectAttachmentCandidates(msgData.payload);

        for (const attachment of attachments) {
          const bytes = await downloadAttachmentBytes(access_token, meta.id, attachment);
          if (!bytes || bytes.length === 0) continue;

          const receipt = await parseReceiptAttachment(bytes, attachment.mimeType, receivedAt);
          if (!receipt) continue;

          const storagePath = await uploadAttachment(supabase, user.id, meta.id, attachment, bytes);
          if (!storagePath) continue;

          const attachmentType = attachment.mimeType === 'application/pdf' ? 'pdf' : 'image';
          const receiptId = await insertReceiptForEmail(
            supabase,
            user.id,
            meta,
            msgData,
            receipt,
            attachmentType,
            storagePath
          );
          if (receiptId) return { kind: 'imported', receipt_id: receiptId, message_id: meta.id };
        }

        const emailBody = extractBody(msgData.payload);
        const urls = extractUrls(emailBody);
        if (!emailBody || emailBody.length < 20) {
          return urls.length > 0
            ? { kind: 'retry', message_id: meta.id }
            : { kind: 'skip', message_id: meta.id };
        }

        const classification = await classifyEmailBody(meta, emailBody, urls, receivedAt);

        if (classification?.status === 'receipt' && classification.receipt) {
          const attachmentType = urls.length > 0 ? 'link_only' : 'none';
          const receiptId = await insertReceiptForEmail(
            supabase,
            user.id,
            meta,
            msgData,
            classification.receipt,
            attachmentType,
            null
          );
          if (receiptId) {
            return attachmentType === 'link_only'
              ? { kind: 'link_only', receipt_id: receiptId, message_id: meta.id }
              : { kind: 'imported', receipt_id: receiptId, message_id: meta.id };
          }
        }

        if (classification?.status === 'link_needs_attention' || urls.length > 0) {
          const pendingId = await upsertPendingEmailReceipt(
            supabase,
            user.id,
            meta,
            msgData,
            classification?.merchant_hint ?? null,
            classification?.reason ?? null
          );
          return pendingId
            ? { kind: 'attention', pending_id: pendingId, message_id: meta.id }
            : { kind: 'retry', message_id: meta.id };
        }

        return { kind: 'skip', message_id: meta.id };
      } catch {
        return { kind: 'retry', message_id: meta.id };
      }
    }
  );

  const metaScanned = toProcess.filter(
    (id) => !candidates.some((candidate) => candidate.id === id)
  );
  const processedScanned = processResults
    .filter((result) => result.kind !== 'retry')
    .map((result) => result.message_id);
  const scannedToWrite = Array.from(new Set([...metaScanned, ...processedScanned]));

  if (scannedToWrite.length > 0) {
    await supabase.from('email_scan_history').upsert(
      scannedToWrite.map((id) => ({ user_id: user.id, email_message_id: id })),
      { onConflict: 'user_id,email_message_id', ignoreDuplicates: true }
    );
  }

  const imported_receipt_ids: string[] = [];
  const link_only_receipt_ids: string[] = [];
  const pending_email_receipt_ids: string[] = [];
  let skipped = metaScanned.length;

  for (const result of processResults) {
    if (result.kind === 'imported') imported_receipt_ids.push(result.receipt_id);
    else if (result.kind === 'link_only') link_only_receipt_ids.push(result.receipt_id);
    else if (result.kind === 'attention') pending_email_receipt_ids.push(result.pending_id);
    else if (result.kind === 'skip') skipped++;
  }

  const imported = imported_receipt_ids.length + link_only_receipt_ids.length;

  return new Response(
    JSON.stringify({
      imported,
      imported_receipt_ids,
      link_only_receipt_ids,
      pending_email_receipt_ids,
      processed: toProcess.length,
      skipped,
      already_scanned,
      remaining,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

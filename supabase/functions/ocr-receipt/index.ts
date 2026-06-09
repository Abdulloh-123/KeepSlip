import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const OCR_RATE_LIMIT = 20;
const OCR_RATE_WINDOW_SECONDS = 60 * 60;
const ANTHROPIC_TIMEOUT_MS = 25_000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

type SupabaseClient = ReturnType<typeof createClient>;
type ParsedReceipt = {
  merchant_name: string;
  date: string;
  total_amount: number;
  currency: string;
  category: string | null;
  line_items: Array<{ description: string; amount: number }>;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function logFunctionEvent(
  supabase: SupabaseClient,
  params: {
    userId?: string;
    eventType: string;
    severity: 'info' | 'warning' | 'error';
    requestId: string;
    metadata?: Record<string, unknown>;
  }
) {
  const { error } = await supabase.from('function_events').insert({
    user_id: params.userId ?? null,
    function_name: 'ocr-receipt',
    event_type: params.eventType,
    severity: params.severity,
    request_id: params.requestId,
    metadata: params.metadata ?? {},
  });
  if (error) console.error('function_events insert failed', params.requestId, error.message);
}

async function updateJob(
  supabase: SupabaseClient,
  jobId: string,
  updates: Record<string, unknown>
) {
  const { error } = await supabase
    .from('processing_jobs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  if (error) console.error('processing_jobs update failed', jobId, error.message);
}

function isValidStoragePath(storagePath: string, userId: string) {
  return (
    storagePath.startsWith(`${userId}/`) &&
    !storagePath.includes('..') &&
    !storagePath.includes('\\') &&
    !storagePath.startsWith('/') &&
    storagePath.split('/').every(Boolean)
  );
}

function isSupportedMimeType(mimeType: string) {
  return /^image\/(jpeg|jpg|png|webp)$/.test(mimeType) || mimeType === 'application/pdf';
}

function sanitizeLineItems(value: unknown): Array<{ description: string; amount: number }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const amount = Number(record.amount ?? 0);
      return {
        description: String(record.description ?? 'Item'),
        amount: Number.isFinite(amount) ? amount : 0,
      };
    })
    .filter((item) => item.description.trim().length > 0);
}

function sumLineItems(lineItems: Array<{ description: string; amount: number }>) {
  const total = lineItems.reduce((sum, item) => sum + item.amount, 0);
  return Number(total.toFixed(2));
}

function parseReceiptJson(cleaned: string): ParsedReceipt | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  const lineItems = sanitizeLineItems(parsed.line_items);
  const lineItemSubtotal = sumLineItems(lineItems);
  const parsedTotal = Number(parsed.total_amount);
  const parsedSubtotal = Number(parsed.subtotal_amount ?? parsed.subtotal);
  let totalAmount = Number.isFinite(parsedTotal) ? parsedTotal : 0;
  if (totalAmount <= 0 && Number.isFinite(parsedSubtotal) && parsedSubtotal > 0) {
    totalAmount = parsedSubtotal;
  }
  if (totalAmount <= 0 && lineItemSubtotal > 0) {
    totalAmount = lineItemSubtotal;
  }
  if (!Number.isFinite(totalAmount)) return null;

  const merchantName = String(parsed.merchant_name ?? '').trim();
  if (!merchantName) return null;

  const date = String(parsed.date ?? new Date().toISOString().slice(0, 10));
  const currency = String(parsed.currency ?? 'AUD').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;

  return {
    merchant_name: merchantName,
    date,
    total_amount: totalAmount,
    currency,
    category: parsed.category ? String(parsed.category) : null,
    line_items: lineItems,
  };
}

function buildAnthropicContent(base64: string, mediaType: string, prompt: string) {
  if (mediaType === 'application/pdf') {
    return [
      {
        type: 'document',
        source: { type: 'base64', media_type: mediaType, data: base64 },
      },
      { type: 'text', text: prompt },
    ];
  }

  return [
    {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: base64 },
    },
    { type: 'text', text: prompt },
  ];
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

serve(async (req) => {
  const requestId = crypto.randomUUID();

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed', request_id: requestId }, 405);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  let jobId: string | null = null;
  let userId: string | undefined;

  try {
    const authHeader = req.headers.get('Authorization');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader?.replace('Bearer ', '') ?? ''
    );
    if (authErr || !user) {
      return jsonResponse({ error: 'Unauthorized', request_id: requestId }, 401);
    }
    userId = user.id;

    const { data: allowed, error: rateLimitError } = await supabase.rpc('check_rate_limit', {
      p_user_id: user.id,
      p_action: 'ocr_receipt',
      p_limit: OCR_RATE_LIMIT,
      p_window_seconds: OCR_RATE_WINDOW_SECONDS,
    });
    if (rateLimitError) {
      await logFunctionEvent(supabase, {
        userId: user.id,
        eventType: 'rate_limit_error',
        severity: 'error',
        requestId,
        metadata: { message: rateLimitError.message },
      });
      return jsonResponse({ error: 'Rate limit unavailable', request_id: requestId }, 503);
    }
    if (!allowed) {
      await logFunctionEvent(supabase, {
        userId: user.id,
        eventType: 'rate_limited',
        severity: 'warning',
        requestId,
      });
      return jsonResponse({ error: 'Rate limit exceeded', request_id: requestId }, 429);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid JSON body', request_id: requestId }, 400);
    }

    const storagePath = body.storage_path;
    const mimeType = body.mime_type;

    if (typeof storagePath !== 'string' || !isValidStoragePath(storagePath, user.id)) {
      return jsonResponse({ error: 'Invalid file path', request_id: requestId }, 403);
    }
    if (typeof mimeType !== 'string' || !isSupportedMimeType(mimeType)) {
      return jsonResponse({ error: 'Unsupported mime type', request_id: requestId }, 400);
    }

    const { data: existingJob } = await supabase
      .from('processing_jobs')
      .select('id, status, receipt_id')
      .eq('user_id', user.id)
      .eq('job_type', 'ocr_receipt')
      .eq('storage_path', storagePath)
      .in('status', ['processing', 'completed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingJob?.status === 'completed' && existingJob.receipt_id) {
      const { data: existingReceipt } = await supabase
        .from('receipts')
        .select('*')
        .eq('id', existingJob.receipt_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingReceipt) {
        return jsonResponse({
          ...existingReceipt,
          receipt_id: existingReceipt.id,
          job_id: existingJob.id,
          request_id: requestId,
          reused: true,
        });
      }
    }

    if (existingJob?.status === 'processing') {
      return jsonResponse({
        error: 'Receipt is already processing',
        job_id: existingJob.id,
        request_id: requestId,
      }, 409);
    }

    const { data: job, error: jobError } = await supabase
      .from('processing_jobs')
      .insert({
        user_id: user.id,
        job_type: 'ocr_receipt',
        status: 'processing',
        storage_path: storagePath,
        metadata: { mime_type: mimeType, request_id: requestId },
      })
      .select('id')
      .single();
    if (jobError) {
      if (jobError.code === '23505') {
        return jsonResponse({ error: 'Receipt is already processing', request_id: requestId }, 409);
      }
      throw jobError;
    }
    jobId = job.id;

    const { data: signed, error: signErr } = await supabase.storage
      .from('receipts')
      .createSignedUrl(storagePath, 60);
    if (signErr || !signed) {
      await updateJob(supabase, jobId, {
        status: 'failed',
        error_code: 'storage_sign_failed',
        error_message: 'Could not access file',
      });
      return jsonResponse({ error: 'Could not access file', request_id: requestId }, 400);
    }

    const fileResp = await fetchWithTimeout(signed.signedUrl, {}, 10_000);
    if (!fileResp.ok) {
      await updateJob(supabase, jobId, {
        status: 'failed',
        error_code: 'storage_fetch_failed',
        error_message: 'Could not fetch file',
      });
      return jsonResponse({ error: 'Could not fetch file', request_id: requestId }, 400);
    }

    const contentLength = Number(fileResp.headers.get('content-length') ?? 0);
    if (contentLength > MAX_FILE_BYTES) {
      await updateJob(supabase, jobId, {
        status: 'failed',
        error_code: 'file_too_large',
        error_message: 'File is too large',
      });
      return jsonResponse({ error: 'File is too large', request_id: requestId }, 413);
    }

    const buffer = await fileResp.arrayBuffer();
    if (buffer.byteLength > MAX_FILE_BYTES) {
      await updateJob(supabase, jobId, {
        status: 'failed',
        error_code: 'file_too_large',
        error_message: 'File is too large',
      });
      return jsonResponse({ error: 'File is too large', request_id: requestId }, 413);
    }

    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    const base64 = btoa(binary);

    const mediaType = mimeType.includes('pdf')
      ? 'application/pdf'
      : mimeType.includes('png')
      ? 'image/png'
      : mimeType.includes('webp')
      ? 'image/webp'
      : 'image/jpeg';

    const prompt = `You are a receipt parser for Australian receipt images and PDFs. Extract structured data.

Return ONLY valid JSON with these fields (no markdown, no explanation):
{
  "merchant_name": "string - store/business name",
  "date": "YYYY-MM-DD",
  "total_amount": number,
  "currency": "3-letter ISO code, e.g. AUD",
  "category": "one of: Food & Drink, Transport, Tools & Materials, Office, Clothing, Health, Entertainment, Accommodation, Utilities, Other",
  "line_items": [{"description": "string", "amount": number}]
}

Rules:
- For numeric Australian dates like 08/09/2023, interpret them as DD/MM/YYYY, so this means 2023-09-08.
- Use the receipt's printed purchase date. Do not use today's upload date.
- total_amount must be the final amount charged.
- If the printed total is hidden or unreadable but subtotal or line-item prices are visible, set total_amount to the visible subtotal or sum of line_items.
- Never return total_amount as 0 unless the actual receipt total is clearly 0.
- If you cannot read a field, use null. For total_amount, always return a number.`;

    const response = await fetchWithTimeout(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: buildAnthropicContent(base64, mediaType, prompt),
            },
          ],
        }),
      },
      ANTHROPIC_TIMEOUT_MS
    );

    if (!response.ok) {
      await response.text().catch(() => '');
      await updateJob(supabase, jobId, {
        status: 'failed',
        error_code: 'anthropic_error',
        error_message: `Claude API error: ${response.status}`,
      });
      await logFunctionEvent(supabase, {
        userId: user.id,
        eventType: 'anthropic_error',
        severity: 'error',
        requestId,
        metadata: { status: response.status },
      });
      return jsonResponse({ error: `Claude API error: ${response.status}`, request_id: requestId }, 502);
    }

    const claudeData = await response.json();
    const text = claudeData.content?.[0]?.text ?? '{}';
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const parsed = parseReceiptJson(cleaned);
    if (!parsed) {
      await updateJob(supabase, jobId, {
        status: 'failed',
        error_code: 'parse_failed',
        error_message: 'Could not parse receipt data',
      });
      await logFunctionEvent(supabase, {
        userId: user.id,
        eventType: 'parse_failed',
        severity: 'warning',
        requestId,
        metadata: { storage_path: storagePath },
      });
      return jsonResponse({ error: 'Could not parse receipt data', request_id: requestId }, 422);
    }

    const isPdf = mimeType === 'application/pdf';
    const { data: insertedReceipt, error: receiptError } = await supabase
      .from('receipts')
      .insert({
        user_id: user.id,
        source: 'manual_scan',
        merchant_name: parsed.merchant_name,
        date: parsed.date,
        total_amount: parsed.total_amount,
        currency: parsed.currency,
        category: parsed.category,
        is_business: false,
        line_items: parsed.line_items,
        image_url: isPdf ? null : storagePath,
        pdf_url: isPdf ? storagePath : null,
        email_source: null,
        attachment_type: isPdf ? 'pdf' : 'image',
        raw_text: null,
      })
      .select('*')
      .single();
    if (receiptError) throw receiptError;

    await updateJob(supabase, jobId, {
      status: 'completed',
      receipt_id: insertedReceipt.id,
      metadata: {
        mime_type: mimeType,
        request_id: requestId,
        file_bytes: buffer.byteLength,
      },
    });

    return jsonResponse({
      ...insertedReceipt,
      ...parsed,
      receipt_id: insertedReceipt.id,
      job_id: jobId,
      request_id: requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (jobId) {
      await updateJob(supabase, jobId, {
        status: 'failed',
        error_code: 'internal_error',
        error_message: message,
      });
    }
    await logFunctionEvent(supabase, {
      userId,
      eventType: 'internal_error',
      severity: 'error',
      requestId,
      metadata: { message },
    });
    return jsonResponse({ error: 'Internal server error', request_id: requestId }, 500);
  }
});

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
  await supabase.from('function_events').insert({
    user_id: params.userId ?? null,
    function_name: 'ocr-receipt',
    event_type: params.eventType,
    severity: params.severity,
    request_id: params.requestId,
    metadata: params.metadata ?? {},
  }).then(() => {});
}

async function updateJob(
  supabase: SupabaseClient,
  jobId: string,
  updates: Record<string, unknown>
) {
  await supabase
    .from('processing_jobs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .then(() => {});
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

    const { data: allowed } = await supabase.rpc('check_rate_limit', {
      p_user_id: user.id,
      p_action: 'ocr_receipt',
      p_limit: OCR_RATE_LIMIT,
      p_window_seconds: OCR_RATE_WINDOW_SECONDS,
    });
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
    if (jobError) throw jobError;
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

    const fileResp = await fetch(signed.signedUrl);
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

    const prompt = `You are a receipt parser. Extract structured data from this receipt image or PDF.

Return ONLY valid JSON with these fields (no markdown, no explanation):
{
  "merchant_name": "string - store/business name",
  "date": "YYYY-MM-DD",
  "total_amount": number,
  "currency": "3-letter ISO code, e.g. AUD",
  "category": "one of: Food & Drink, Transport, Tools & Materials, Office, Clothing, Health, Entertainment, Accommodation, Utilities, Other",
  "line_items": [{"description": "string", "amount": number}]
}

If you cannot read a field, use null. For total_amount, always return a number (not null).`;

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
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: mediaType, data: base64 },
                },
                { type: 'text', text: prompt },
              ],
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

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {
        merchant_name: 'Unknown',
        total_amount: 0,
        date: new Date().toISOString().slice(0, 10),
        currency: 'AUD',
        category: null,
        line_items: [],
      };
    }

    parsed.total_amount = Number(parsed.total_amount ?? 0) || 0;
    if (!Array.isArray(parsed.line_items)) parsed.line_items = [];

    await updateJob(supabase, jobId, {
      status: 'completed',
      metadata: {
        mime_type: mimeType,
        request_id: requestId,
        file_bytes: buffer.byteLength,
      },
    });

    return jsonResponse({ ...parsed, job_id: jobId, request_id: requestId });
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

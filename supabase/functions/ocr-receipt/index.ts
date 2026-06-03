import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
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

    const { storage_path, mime_type } = await req.json();
    if (typeof storage_path !== 'string' || !storage_path.startsWith(`${user.id}/`)) {
      return new Response(JSON.stringify({ error: 'Invalid file path' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (storage_path.includes('..')) {
      return new Response(JSON.stringify({ error: 'Invalid file path' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (typeof mime_type !== 'string' || !/(^image\/|application\/pdf)/.test(mime_type)) {
      return new Response(JSON.stringify({ error: 'Unsupported mime type' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate signed URL for private file
    const { data: signed, error: signErr } = await supabase.storage
      .from('receipts')
      .createSignedUrl(storage_path, 60);
    if (signErr || !signed) {
      return new Response(JSON.stringify({ error: 'Could not access file' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the file and convert to base64 without blowing the call stack
    const fileResp = await fetch(signed.signedUrl);
    if (!fileResp.ok) {
      return new Response(JSON.stringify({ error: 'Could not fetch file' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const buffer = await fileResp.arrayBuffer();

    // Chunk the conversion — spread operator blows stack on large images
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    const base64 = btoa(binary);

    const mediaType = mime_type?.includes('pdf')
      ? 'application/pdf'
      : mime_type?.includes('png')
      ? 'image/png'
      : 'image/jpeg';

    const prompt = `You are a receipt parser. Extract structured data from this receipt image or PDF.

Return ONLY valid JSON with these fields (no markdown, no explanation):
{
  "merchant_name": "string — store/business name",
  "date": "YYYY-MM-DD",
  "total_amount": number,
  "currency": "3-letter ISO code, e.g. AUD",
  "category": "one of: Food & Drink, Transport, Tools & Materials, Office, Clothing, Health, Entertainment, Accommodation, Utilities, Other",
  "line_items": [{"description": "string", "amount": number}]
}

If you cannot read a field, use null. For total_amount, always return a number (not null).`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
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
    });

    if (!response.ok) {
      await response.text();
      return new Response(JSON.stringify({ error: `Claude API error: ${response.status}` }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const claudeData = await response.json();
    const text = claudeData.content?.[0]?.text ?? '{}';

    // Strip markdown code fences if Claude added them
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

    // Coerce types — Claude may return total_amount as a string despite the prompt
    parsed.total_amount = Number(parsed.total_amount ?? 0) || 0;
    if (!Array.isArray(parsed.line_items)) parsed.line_items = [];

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

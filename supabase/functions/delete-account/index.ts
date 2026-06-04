import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    function_name: 'delete-account',
    event_type: params.eventType,
    severity: params.severity,
    request_id: params.requestId,
    metadata: params.metadata ?? {},
  }).then(() => {});
}

async function deleteUserStorageFolder(
  supabase: SupabaseClient,
  userId: string
) {
  const prefix = `${userId}/`;
  const pageSize = 100;

  while (true) {
    const { data, error } = await supabase.storage
      .from('receipts')
      .list(prefix, { limit: pageSize, offset: 0 });
    if (error) throw error;
    if (!data || data.length === 0) break;

    const paths = data.map((file) => `${prefix}${file.name}`);
    const { error: removeError } = await supabase.storage.from('receipts').remove(paths);
    if (removeError) throw removeError;

    if (data.length < pageSize) break;
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
  let userId: string | undefined;

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '') ?? '';

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized', request_id: requestId }, 401);
    }
    userId = user.id;

    const { data: allowed } = await supabase.rpc('check_rate_limit', {
      p_user_id: user.id,
      p_action: 'delete_account',
      p_limit: 3,
      p_window_seconds: 60 * 60,
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

    await deleteUserStorageFolder(supabase, user.id);

    const { error: deleteReceiptsError } = await supabase
      .from('receipts')
      .delete()
      .eq('user_id', user.id);
    if (deleteReceiptsError) throw deleteReceiptsError;

    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteUserError) throw deleteUserError;

    await logFunctionEvent(supabase, {
      userId: user.id,
      eventType: 'account_deleted',
      severity: 'info',
      requestId,
    });

    return jsonResponse({ success: true, request_id: requestId });
  } catch {
    await logFunctionEvent(supabase, {
      userId,
      eventType: 'delete_failed',
      severity: 'error',
      requestId,
    });
    return jsonResponse({ error: 'Failed to delete account', request_id: requestId }, 500);
  }
});

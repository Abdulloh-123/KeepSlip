import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

async function deleteUserStorageFolder(
  supabase: ReturnType<typeof createClient>,
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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '') ?? '';
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await deleteUserStorageFolder(supabase, user.id);

    const { error: deleteReceiptsError } = await supabase
      .from('receipts')
      .delete()
      .eq('user_id', user.id);
    if (deleteReceiptsError) throw deleteReceiptsError;

    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteUserError) throw deleteUserError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to delete account' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

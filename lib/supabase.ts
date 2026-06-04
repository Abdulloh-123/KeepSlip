import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import type { Receipt, ReceiptInsert } from '@/types/receipt';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Chunked SecureStore adapter — iOS limit is 2048 bytes per key.
// Supabase session JSON exceeds this, so we split across multiple keys.
async function removeChunkedSecureStoreValue(key: string): Promise<void> {
  const count = await SecureStore.getItemAsync(key + '_n');
  if (count) {
    await Promise.all([
      SecureStore.deleteItemAsync(key + '_n'),
      ...Array.from({ length: Number(count) }, (_, i) =>
        SecureStore.deleteItemAsync(key + '_' + i)
      ),
    ]);
  }
}

const SecureStoreAdapter = {
  getItem: async (key: string) => {
    const count = await SecureStore.getItemAsync(key + '_n');
    if (!count) return SecureStore.getItemAsync(key);
    const chunks = await Promise.all(
      Array.from({ length: Number(count) }, (_, i) =>
        SecureStore.getItemAsync(key + '_' + i)
      )
    );
    return chunks.join('');
  },
  setItem: async (key: string, value: string) => {
    await removeChunkedSecureStoreValue(key);
    if (value.length <= 2000) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += 2000) chunks.push(value.slice(i, i + 2000));
    await SecureStore.deleteItemAsync(key);
    await SecureStore.setItemAsync(key + '_n', String(chunks.length));
    await Promise.all(chunks.map((c, i) => SecureStore.setItemAsync(key + '_' + i, c)));
  },
  removeItem: async (key: string) => {
    await removeChunkedSecureStoreValue(key);
    await SecureStore.deleteItemAsync(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ── Receipts ──────────────────────────────────────────────────────────────────

export async function fetchReceipts(): Promise<Receipt[]> {
  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .order('date', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data as Receipt[];
}

export async function fetchReceipt(id: string): Promise<Receipt> {
  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Receipt;
}

export async function fetchReceiptsByIds(ids: string[]): Promise<Receipt[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .in('id', ids);
  if (error) throw error;

  const byId = new Map((data as Receipt[]).map((receipt) => [receipt.id, receipt]));
  return ids.map((id) => byId.get(id)).filter((receipt): receipt is Receipt => Boolean(receipt));
}

export async function insertReceipt(receipt: ReceiptInsert): Promise<Receipt> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('receipts')
    .insert({ ...receipt, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as Receipt;
}

export async function updateReceipt(
  id: string,
  updates: Partial<ReceiptInsert>
): Promise<Receipt> {
  const { data, error } = await supabase
    .from('receipts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Receipt;
}

export async function deleteReceipt(id: string): Promise<void> {
  const { data: receipt } = await supabase
    .from('receipts')
    .select('image_url, pdf_url')
    .eq('id', id)
    .single();

  const { error } = await supabase.from('receipts').delete().eq('id', id);
  if (error) throw error;

  const paths = [receipt?.image_url, receipt?.pdf_url].filter(Boolean) as string[];
  if (paths.length > 0) {
    await supabase.storage.from('receipts').remove(paths);
  }
}

export async function searchReceipts(query: string): Promise<Receipt[]> {
  const { data, error } = await supabase
    .from('receipts')
    .select('*')
    .textSearch('search_vector', query, { type: 'websearch' })
    .order('date', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as Receipt[];
}

// ── Storage ───────────────────────────────────────────────────────────────────

// Returns storage path (e.g. "userId/1234567890.jpg"), not a public URL.
// Bucket is private — use getReceiptFileUrl(path) to generate a signed URL.
export async function uploadReceiptImage(
  userId: string,
  uri: string,
  mimeType: string
): Promise<string> {
  const ext = mimeType.includes('pdf') ? 'pdf' : 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  // FormData streaming upload — never loads the full file into JS heap.
  const form = new FormData();
  form.append('file', { uri, name: `receipt.${ext}`, type: mimeType } as any);

  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/receipts/${path}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'false',
      },
      body: form,
    }
  );

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any).message ?? 'Upload failed');
  }

  return path;
}

// Generates a 1-hour signed URL for a private receipt file.
// image_url / pdf_url columns store storage paths, not public URLs.
export async function getReceiptFileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('receipts')
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

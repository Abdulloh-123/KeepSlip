import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

const LEGACY_GMAIL_TOKEN_KEY = 'gmail_oauth_token';

const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID!;
const REDIRECT_URI = `com.googleusercontent.apps.621427133226-c5igdgilurqto6vk4gefe9ave1b26o9d:/`;

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

type StoredGmailToken = {
  accessToken: string;
  expiresAt: number | null;
};

async function getGmailTokenKey(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? `${LEGACY_GMAIL_TOKEN_KEY}_${user.id}` : null;
}

function parseStoredToken(raw: string): StoredGmailToken | null {
  try {
    const parsed = JSON.parse(raw) as StoredGmailToken;
    if (!parsed?.accessToken || !parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export type SyncResult = {
  imported: number;
  imported_receipt_ids: string[];
  link_only_receipt_ids: string[];
  pending_email_receipt_ids: string[];
  processed: number;
  skipped: number;
  already_scanned: number;
  remaining: number;
};

export function useGmailAuth() {
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: IOS_CLIENT_ID,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      redirectUri: REDIRECT_URI,
      usePKCE: false,
    },
    discovery
  );
  return { request, response, promptAsync, clientId: IOS_CLIENT_ID, redirectUri: REDIRECT_URI };
}

export async function saveGmailToken(
  token: string,
  expiresInSeconds?: number | null
): Promise<void> {
  const expiresAt = expiresInSeconds
    ? Date.now() + Math.max(expiresInSeconds - 60, 0) * 1000
    : null;
  const key = await getGmailTokenKey();
  if (!key) throw new Error('Not authenticated');
  await SecureStore.setItemAsync(
    key,
    JSON.stringify({ accessToken: token, expiresAt } satisfies StoredGmailToken)
  );
}

export async function getGmailToken(): Promise<string | null> {
  const key = await getGmailTokenKey();
  if (!key) return null;
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return null;
  const parsed = parseStoredToken(raw);
  if (!parsed || Date.now() >= parsed.expiresAt!) {
    await SecureStore.deleteItemAsync(key);
    return null;
  }
  return parsed.accessToken;
}

export async function revokeGmailToken(): Promise<void> {
  const key = await getGmailTokenKey();
  const token = await getGmailToken();
  if (token) {
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      { method: 'POST' }
    ).catch(() => null);
  }
  if (key) await SecureStore.deleteItemAsync(key);
  await SecureStore.deleteItemAsync(LEGACY_GMAIL_TOKEN_KEY);
}

export async function isGmailConnected(): Promise<boolean> {
  const key = await getGmailTokenKey();
  const token = await getGmailToken();
  if (!token) return false;
  try {
    const resp = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${encodeURIComponent(token)}`
    );
    if (resp.ok) return true;
    if (key) await SecureStore.deleteItemAsync(key);
    return false;
  } catch {
    return false;
  }
}

export async function syncGmailReceipts(
  accessToken: string,
  lookbackDays = 60
): Promise<SyncResult> {
  const { data, error } = await supabase.functions.invoke('email-sync', {
    body: { access_token: accessToken, lookback_days: lookbackDays },
  });
  if (error) throw error;
  return data as SyncResult;
}

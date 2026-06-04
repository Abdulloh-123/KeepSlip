// Must mock supabase before importing gmail — supabase.ts calls createClient() at module load
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(() => Promise.resolve({ data: { user: { id: 'user-1' } } })),
    },
    functions: { invoke: jest.fn() },
  },
}));

import * as SecureStore from 'expo-secure-store';
import {
  saveGmailToken,
  getGmailToken,
  revokeGmailToken,
  isGmailConnected,
} from '../lib/gmail';

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

global.fetch = jest.fn();

const mockSecureStore = SecureStore as jest.Mocked<typeof SecureStore>;
const GMAIL_TOKEN_KEY = 'gmail_oauth_token_user-1';

describe('gmail token management', () => {
  beforeEach(() => jest.clearAllMocks());

  it('saveGmailToken writes to SecureStore', async () => {
    mockSecureStore.setItemAsync.mockResolvedValue();
    await saveGmailToken('test-token', 3600);
    expect(mockSecureStore.setItemAsync).toHaveBeenCalledWith(
      GMAIL_TOKEN_KEY,
      expect.stringContaining('"accessToken":"test-token"')
    );
  });

  it('getGmailToken reads JSON token from SecureStore', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(
      JSON.stringify({ accessToken: 'test-token', expiresAt: Date.now() + 60_000 })
    );
    const token = await getGmailToken();
    expect(token).toBe('test-token');
  });

  it('isGmailConnected returns true when token exists', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(
      JSON.stringify({ accessToken: 'some-token', expiresAt: Date.now() + 60_000 })
    );
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });
    expect(await isGmailConnected()).toBe(true);
  });

  it('isGmailConnected returns false when no token', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(null);
    expect(await isGmailConnected()).toBe(false);
  });

  it('revokeGmailToken calls Google revoke endpoint and deletes from store', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(
      JSON.stringify({ accessToken: 'token-to-revoke', expiresAt: Date.now() + 60_000 })
    );
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true });

    await revokeGmailToken();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('oauth2.googleapis.com/revoke'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('gmail_oauth_token');
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(GMAIL_TOKEN_KEY);
  });

  it('revokeGmailToken skips Google call when no token stored', async () => {
    mockSecureStore.getItemAsync.mockResolvedValue(null);

    await revokeGmailToken();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith('gmail_oauth_token');
    expect(mockSecureStore.deleteItemAsync).toHaveBeenCalledWith(GMAIL_TOKEN_KEY);
  });
});

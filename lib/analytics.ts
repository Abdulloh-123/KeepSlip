import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

const APP_VERSION = '1.0.0';

type AnalyticsPrimitive = string | number | boolean | null;
type AnalyticsProperties = Record<string, AnalyticsPrimitive | undefined>;

type ErrorSeverity = 'warning' | 'error' | 'fatal';

interface ErrorContext {
  screen?: string;
  severity?: ErrorSeverity;
  properties?: AnalyticsProperties;
}

let sessionId: string | null = null;
let globalHandlerInstalled = false;

function createSessionId() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${randomPart}`;
}

function getSessionId() {
  if (!sessionId) sessionId = createSessionId();
  return sessionId;
}

function cleanProperties(properties: AnalyticsProperties = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined)
  );
}

async function getCurrentUserId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

export function describeError(error: unknown) {
  if (error instanceof Error) {
    return {
      error_name: error.name || 'Error',
      error_message: error.message || 'Unknown error',
      stack: error.stack ?? null,
    };
  }

  if (typeof error === 'object' && error !== null) {
    const maybeError = error as { name?: unknown; message?: unknown; stack?: unknown };
    return {
      error_name: typeof maybeError.name === 'string' ? maybeError.name : 'Error',
      error_message:
        typeof maybeError.message === 'string' ? maybeError.message : JSON.stringify(error),
      stack: typeof maybeError.stack === 'string' ? maybeError.stack : null,
    };
  }

  return {
    error_name: 'Error',
    error_message: String(error ?? 'Unknown error'),
    stack: null,
  };
}

export async function trackEvent(
  eventName: string,
  properties: AnalyticsProperties = {},
  screen?: string
) {
  try {
    await supabase.from('app_events').insert({
      user_id: await getCurrentUserId(),
      session_id: getSessionId(),
      event_name: eventName,
      screen: screen ?? null,
      properties: cleanProperties(properties),
      app_version: APP_VERSION,
      platform: Platform.OS,
    });
  } catch {
    // Analytics should never interrupt the user flow.
  }
}

export async function trackError(error: unknown, context: ErrorContext = {}) {
  try {
    const details = describeError(error);
    await supabase.from('app_errors').insert({
      user_id: await getCurrentUserId(),
      session_id: getSessionId(),
      ...details,
      screen: context.screen ?? null,
      severity: context.severity ?? 'error',
      properties: cleanProperties(context.properties),
      app_version: APP_VERSION,
      platform: Platform.OS,
    });
  } catch {
    // Error reporting should never create another user-visible error.
  }
}

export function installGlobalErrorHandler() {
  if (globalHandlerInstalled) return;
  globalHandlerInstalled = true;

  const errorUtils = (globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
      setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
    };
  }).ErrorUtils;

  if (!errorUtils?.setGlobalHandler) return;

  const previousHandler = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error, isFatal) => {
    void trackError(error, {
      screen: 'global',
      severity: isFatal ? 'fatal' : 'error',
      properties: { is_fatal: Boolean(isFatal) },
    });
    previousHandler?.(error, isFatal);
  });
}

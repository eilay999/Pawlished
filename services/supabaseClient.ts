import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const SUPABASE_FETCH_TIMEOUT_MS = 10_000;
const SUPABASE_READ_RETRY_DELAYS_MS = [300, 900, 1_800];

const supabaseProjectRef = (() => {
  try {
    return supabaseUrl ? new URL(supabaseUrl).hostname.split(".")[0] : null;
  } catch {
    return null;
  }
})();

const clearLegacySupabaseSession = () => {
  if (typeof window === "undefined" || !supabaseProjectRef) return;

  const legacyKeys = [
    `sb-${supabaseProjectRef}-auth-token`,
    `sb-${supabaseProjectRef}-auth-token-code-verifier`,
  ];

  for (const key of legacyKeys) {
    window.localStorage.removeItem(key);
  }
};

clearLegacySupabaseSession();

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const isRetriableReadResponse = (response: Response) =>
  response.status === 408 || response.status === 429 || response.status >= 500;

const getRequestMethod = (input: RequestInfo | URL, init?: RequestInit) => {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
};

const cloneFetchInput = (input: RequestInfo | URL): RequestInfo | URL => {
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.clone();
  }
  return input;
};

const withTimeout = (init?: RequestInit) => {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, SUPABASE_FETCH_TIMEOUT_MS);

  const abortFromCaller = () => controller.abort();
  if (init?.signal) {
    if (init.signal.aborted) {
      abortFromCaller();
    } else {
      init.signal.addEventListener("abort", abortFromCaller, { once: true });
    }
  }

  return {
    init: { ...init, signal: controller.signal },
    timedOut: () => timedOut,
    cleanup: () => {
      window.clearTimeout(timeoutId);
      init?.signal?.removeEventListener("abort", abortFromCaller);
    },
  };
};

const createResilientFetch =
  (baseFetch: typeof fetch): typeof fetch =>
  async (input, init) => {
    const method = getRequestMethod(input, init);
    const canRetry = method === "GET" || method === "HEAD";
    const maxAttempts = canRetry ? SUPABASE_READ_RETRY_DELAYS_MS.length + 1 : 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const timedRequest = withTimeout(init);

      try {
        const response = await baseFetch(cloneFetchInput(input), timedRequest.init);
        timedRequest.cleanup();

        if (
          canRetry &&
          attempt < maxAttempts - 1 &&
          isRetriableReadResponse(response)
        ) {
          void response.body?.cancel().catch(() => undefined);
          await wait(SUPABASE_READ_RETRY_DELAYS_MS[attempt]);
          continue;
        }

        return response;
      } catch (error) {
        timedRequest.cleanup();
        lastError = error;

        if (
          !canRetry ||
          attempt >= maxAttempts - 1 ||
          (init?.signal?.aborted && !timedRequest.timedOut())
        ) {
          throw error;
        }

        await wait(SUPABASE_READ_RETRY_DELAYS_MS[attempt]);
      }
    }

    throw lastError;
  };

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
        global: {
          fetch: createResilientFetch(fetch.bind(globalThis)),
        },
      })
    : null;

import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAuthToken } from "./authToken";
import { config } from "./config";

function resolveCredentials(url: string): RequestCredentials {
  try {
    const requestOrigin = new URL(url, window.location.origin).origin;
    return requestOrigin === window.location.origin ? "include" : "omit";
  } catch {
    return "same-origin";
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const credentials = resolveCredentials(url);
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Prepend backend URL for API calls
    const baseUrl = (import.meta.env.VITE_API_BASE_URL || config.api.baseURL || "").replace(/\/$/, "");
    const firstKey = String(queryKey[0]);
    const joinedKey = queryKey.map((key) => String(key)).join("/");
    const url = firstKey.startsWith("/api")
      ? `${baseUrl}${joinedKey}`
      : joinedKey;

    const token = getAuthToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const credentials = resolveCredentials(url);

    const res = await fetch(url, {
      credentials,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: 10 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

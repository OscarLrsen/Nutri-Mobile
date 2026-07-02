import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios";

import { env } from "@/lib/env";
import { getAccessToken } from "@/services/auth/getAccessToken";
import type { ApiError } from "@/types/api";

/**
 * Single shared axios instance for every backend call. Mirrors
 * Nutri-Frontend's `src/lib/api.ts` single-source-of-truth pattern (spec
 * §14) — that file's own operating rule is "adding a new endpoint = add to
 * api.ts only, no ad-hoc fetch calls scattered through pages"; the mobile
 * equivalent of that rule is: every backend call goes through this client,
 * never a bare `fetch`/`axios.get` inline in a screen.
 */
// axios's CJS interop makes `.create` look like it could be the named
// export; it's the default export's method, this is the standard usage.
// eslint-disable-next-line import/no-named-as-default-member
export const apiClient = axios.create({
  baseURL: env.EXPO_PUBLIC_API_URL,
  headers: { "Content-Type": "application/json" },
});

/** Marks a request as requiring auth — set `authRequired: true` in the
 * request config to attach a Bearer token (see requireAuth() below). Plain
 * requests (e.g. public menu endpoints) skip this by default.
 *
 * Augmenting the base `AxiosRequestConfig` (not `InternalAxiosRequestConfig`,
 * which extends it) is deliberate: call sites like `apiClient.get(url, cfg)`
 * are typed against the public `AxiosRequestConfig`, and `requireAuth()`
 * below must return something assignable there. `InternalAxiosRequestConfig`
 * is only the type axios itself passes into interceptors below — it's a
 * subtype with more required fields (a fully-normalized `headers`), and
 * constructing a fake one just to satisfy a public-facing helper's default
 * parameter would need an unsafe cast. Augmenting the base type covers both,
 * since InternalAxiosRequestConfig inherits it. */
declare module "axios" {
  interface AxiosRequestConfig {
    authRequired?: boolean;
  }
}

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (config.authRequired) {
    const token = await getAccessToken();
    if (!token) {
      // Matches Nutri-Frontend's ordersApi.create() fast-fail behavior for
      // tailored lines without a session (spec §14.2) — fail before the
      // network call rather than let the backend return a 401.
      throw new Error("Not authenticated");
    }
    config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

/** Convenience helper for call sites: `apiClient.get(url, requireAuth())`. */
export function requireAuth(config: AxiosRequestConfig = {}): AxiosRequestConfig {
  return { ...config, authRequired: true };
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const normalized: ApiError = error.response
      ? {
          status: error.response.status,
          message: extractMessage(error.response.data) ?? error.message,
          details: error.response.data,
        }
      : {
          // No response received — network failure, timeout, or DNS/CORS-
          // equivalent issue. status: 0 lets callers distinguish "server
          // said no" from "couldn't reach the server at all".
          status: 0,
          message: "Kunde inte nå Nutri. Kontrollera din internetanslutning.",
          details: error.message,
        };
    return Promise.reject(normalized);
  }
);

function extractMessage(data: unknown): string | undefined {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "message" in data && typeof data.message === "string") {
    return data.message;
  }
  if (data && typeof data === "object" && "title" in data && typeof data.title === "string") {
    // ASP.NET Core's default ProblemDetails shape for unhandled 400s.
    return data.title;
  }
  return undefined;
}

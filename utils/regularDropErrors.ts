import type { ApiError } from "@/types/api";

/**
 * Stable error model for the Regular Drops endpoints. The backend answers
 * with { code, message } bodies (codes below); the axios interceptor has
 * already normalized transport errors to ApiError { status, message,
 * details } with status 0 for network failures. This parser never throws,
 * never leaks raw backend text as customer copy (the UI translates `code`
 * via regularDrops.errors.*), and collapses anything unrecognized — HTML
 * bodies, empty responses, future codes — to "unknown".
 */

const KNOWN_CODES = [
  "invalidUser",
  "pollNotFound",
  "pollNotActive",
  "optionNotFound",
  "optionMismatch",
] as const;

export type RegularDropApiErrorCode = (typeof KNOWN_CODES)[number] | "network" | "unknown";

export interface RegularDropApiError {
  /** HTTP status; 0 = network failure per the shared client contract. */
  status: number;
  code: RegularDropApiErrorCode;
  /** Technical message for logging/debugging — NEVER customer copy. */
  message: string;
}

function isApiError(err: unknown): err is ApiError {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof (err as ApiError).status === "number" &&
    "message" in err
  );
}

function extractCode(details: unknown): string | null {
  if (typeof details !== "object" || details === null) return null;
  const code = (details as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function parseRegularDropError(err: unknown): RegularDropApiError {
  if (!isApiError(err)) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { status: 0, code: "unknown", message };
  }
  if (err.status === 0) {
    return { status: 0, code: "network", message: err.message };
  }
  const raw = extractCode(err.details);
  const code = (KNOWN_CODES as readonly string[]).includes(raw ?? "")
    ? (raw as RegularDropApiErrorCode)
    : err.status === 401
      ? "invalidUser"
      : "unknown";
  return { status: err.status, code, message: err.message };
}

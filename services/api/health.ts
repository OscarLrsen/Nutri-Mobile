import { apiClient } from "./client";

/**
 * The only backend endpoint wired up in this infrastructure phase, on
 * purpose: `GET /health` (Program.cs — `app.MapGet("/health", () =>
 * Results.Ok(new { status = "ok" }))`), a genuinely business-logic-free
 * endpoint. It exists here to prove the API layer (base URL, axios
 * instance, error normalization) actually reaches the real backend, without
 * building any menu/order/nutrition feature ahead of scope.
 */
export interface HealthResponse {
  status: string;
}

export async function getHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>("/health");
  return data;
}

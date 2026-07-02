import { apiClient } from "./client";

/**
 * Store status + location — the two PUBLIC endpoints the landing screen
 * needs. Types are copied field-for-field from Nutri-Frontend's
 * src/lib/api.ts (`StoreStatusData`, `LocationInfoData`) which mirror the
 * backend's StoreStatusDto / LocationInfoDto (spec §1.4, §2.6, §14.2).
 * Do not add or rename fields here without checking the backend DTO first.
 */

export interface StoreStatusData {
  status: "Open" | "Paused" | "Closed";
  pauseStart: string | null;
  pauseEnd: string | null;
  pauseMessage: string;
  location: string;
  publicMessage: string | null;
  nextOpenAtUtc: string | null;
  locationNote: string | null;
}

export interface LocationInfoData {
  locationName: string;
  locationNameEn?: string | null;
  description: string;
  descriptionEn?: string | null;
  mapUrl: string;
  /** "HH:mm" */
  openTime: string;
  /** "HH:mm" */
  closeTime: string;
  isTemporarilyClosed: boolean;
  isVisible: boolean;
}

/** GET /api/store/status — public, no auth. */
export async function getStoreStatus(): Promise<StoreStatusData> {
  const { data } = await apiClient.get<StoreStatusData>("/api/store/status");
  return data;
}

/** GET /api/store/location — public, no auth. */
export async function getLocation(): Promise<LocationInfoData> {
  const { data } = await apiClient.get<LocationInfoData>("/api/store/location");
  return data;
}

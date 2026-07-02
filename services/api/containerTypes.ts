import { apiClient } from "./client";

/** Container types — PUBLIC endpoint (active types only). Ported from the
 * web's containerTypesApi (spec §2.12/§14.2). */
export interface ApiContainerType {
  id: string;
  name: string;
  maxWeightGrams: number;
  pricePerExtraContainerOre: number;
  isActive: boolean;
  sortOrder: number;
}

/** GET /api/container-types — public. */
export async function getContainerTypes(): Promise<ApiContainerType[]> {
  const { data } = await apiClient.get<ApiContainerType[]>("/api/container-types");
  return data;
}

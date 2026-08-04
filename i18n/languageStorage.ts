import { storage } from "@/services/storage/asyncStorage";

import { isSupportedLanguage, type AppLanguage } from "./languages";

/**
 * Persisted language preference. Mirrors the web's localStorage["nutri-lang"]
 * (spec §11.5) via the shared AsyncStorage wrapper. A stored value that is no
 * longer a supported language is treated as absent.
 */
const LANGUAGE_STORAGE_KEY = "nutri-lang";

export async function loadStoredLanguage(): Promise<AppLanguage | null> {
  const stored = await storage.getItem<string>(LANGUAGE_STORAGE_KEY);
  return isSupportedLanguage(stored) ? stored : null;
}

export async function saveStoredLanguage(language: AppLanguage): Promise<void> {
  await storage.setItem(LANGUAGE_STORAGE_KEY, language);
}

export async function clearStoredLanguage(): Promise<void> {
  await storage.removeItem(LANGUAGE_STORAGE_KEY);
}

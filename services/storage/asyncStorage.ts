import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Thin, typed wrapper around AsyncStorage for non-sensitive, feature-owned
 * persisted state (e.g. a future cart store mirroring Nutri-Frontend's
 * localStorage["nutri-cart"], or a language preference mirroring
 * localStorage["nutri-lang"] — spec §11.1/§11.5).
 *
 * No cart/language store is implemented yet (out of scope for this
 * infrastructure phase) — this module exists so feature code has a single,
 * consistent place to persist simple JSON-serializable state without each
 * feature reaching for AsyncStorage directly.
 */
export const storage = {
  async getItem<T>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Corrupt/invalid stored JSON — treat as absent rather than throwing,
      // matching the web CartContext's documented fallback-to-empty behavior.
      return null;
    }
  },

  async setItem<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
};

import * as SecureStore from "expo-secure-store";

/**
 * Storage adapter conforming to the interface @supabase/supabase-js expects
 * (getItem/setItem/removeItem returning Promises), backed by expo-secure-store
 * (Keychain on iOS, Keystore-backed EncryptedSharedPreferences on Android)
 * instead of AsyncStorage — session tokens are credential material and
 * deserve at-rest encryption, unlike the cart/language data that will later
 * use plain AsyncStorage (see services/storage/asyncStorage.ts).
 *
 * SecureStore values are capped at 2048 bytes per key on some platforms;
 * Supabase sessions are normally well under that, but if this ever throws
 * on write, chunking the value is the standard workaround — not needed yet.
 */
export const secureStorageAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

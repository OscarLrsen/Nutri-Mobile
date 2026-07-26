import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "./config";
import { detectDeviceLanguage } from "./detectDeviceLanguage";
import { DEFAULT_LANGUAGE, type AppLanguage } from "./languages";
import { clearStoredLanguage, loadStoredLanguage, saveStoredLanguage } from "./languageStorage";

interface LanguageContextValue {
  /** The active language. Swedish until the stored/device preference resolves. */
  language: AppLanguage;
  /** True once the stored/device preference has been resolved on startup. */
  isReady: boolean;
  /** Switch language and persist the choice. */
  setLanguage: (language: AppLanguage) => Promise<void>;
  /** Forget the stored choice and fall back to the device language (or Swedish). */
  resetLanguage: () => Promise<void>;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Owns the active locale for the whole app: reads the stored preference (or
 * the device language) on startup, exposes change/reset, and keeps the shared
 * i18next instance in sync. Wraps children in I18nextProvider so useTranslation
 * works anywhere below.
 *
 * Startup order (spec §11.5): stored preference → device language if supported
 * → Swedish. Resolution runs in an effect after first paint; because Swedish
 * is the default and nothing consumes t() yet, this can never cause a visible
 * change in the current phase.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(DEFAULT_LANGUAGE);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const stored = await loadStoredLanguage();
      const initial = stored ?? detectDeviceLanguage();
      if (!active) return;
      if (initial !== i18n.language) await i18n.changeLanguage(initial);
      if (!active) return;
      setLanguageState(initial);
      setIsReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const setLanguage = useCallback(async (next: AppLanguage) => {
    await i18n.changeLanguage(next);
    await saveStoredLanguage(next);
    setLanguageState(next);
  }, []);

  const resetLanguage = useCallback(async () => {
    await clearStoredLanguage();
    const fallback = detectDeviceLanguage();
    await i18n.changeLanguage(fallback);
    setLanguageState(fallback);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({ language, isReady, setLanguage, resetLanguage }),
    [language, isReady, setLanguage, resetLanguage],
  );

  return (
    <I18nextProvider i18n={i18n}>
      <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
    </I18nextProvider>
  );
}

/** Read/change the active language. Must be used within a LanguageProvider. */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}

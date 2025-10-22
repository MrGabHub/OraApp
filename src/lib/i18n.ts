import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import HttpBackend from "i18next-http-backend";

export const SUPPORTED_LANGUAGES = ["fr", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = "fr";
export const LOCAL_STORAGE_LANGUAGE_KEY = "ora-language";

if (!i18n.isInitialized) {
  i18n
    .use(HttpBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: SUPPORTED_LANGUAGES,
      defaultNS: "common",
      ns: ["common"],
      interpolation: {
        escapeValue: false,
      },
      detection: {
        order: ["querystring", "localStorage", "navigator"],
        lookupLocalStorage: LOCAL_STORAGE_LANGUAGE_KEY,
        caches: ["localStorage"],
      },
      backend: {
        loadPath: "/locales/{{lng}}/{{ns}}.json",
      },
      react: {
        useSuspense: true,
      },
    })
    .catch((error) => {
      console.error("Failed to initialize i18n", error);
    });
}

export function changeLanguage(lang: SupportedLanguage) {
  return i18n.changeLanguage(lang);
}

export default i18n;

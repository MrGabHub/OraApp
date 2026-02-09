import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import HttpBackend from "i18next-http-backend";

export const SUPPORTED_LANGUAGES = ["fr", "en"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: SupportedLanguage = "fr";
export const LOCAL_STORAGE_LANGUAGE_KEY = "ora-language";
const LOCALES_VERSION = "2026-02-09-utf8-fix-4";

function maybeRepairMojibake(value: string): string {
  if (!/[ÃÂâ]/.test(value)) return value;
  const bytes = Uint8Array.from(Array.from(value).map((ch) => ch.charCodeAt(0) & 0xff));
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const bad = (input: string) => (input.match(/[ÃÂâ]/g) || []).length;
  return bad(decoded) < bad(value) ? decoded : value;
}

function deepRepair(input: unknown): unknown {
  if (typeof input === "string") return maybeRepairMojibake(input);
  if (Array.isArray(input)) return input.map((item) => deepRepair(item));
  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>).map(([key, value]) => [key, deepRepair(value)]),
    );
  }
  return input;
}

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
        loadPath: `/locales/{{lng}}/{{ns}}.json?v=${LOCALES_VERSION}`,
        parse: (data: string) => deepRepair(JSON.parse(data)),
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

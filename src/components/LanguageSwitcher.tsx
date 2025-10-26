import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import {
  LOCAL_STORAGE_LANGUAGE_KEY,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
  changeLanguage,
} from "../lib/i18n";
import "./languageSwitcher.css";

type Props = {
  onLanguageChange?: (lang: SupportedLanguage) => void;
};

export default function LanguageSwitcher({ onLanguageChange }: Props) {
  const { i18n, t } = useTranslation();
  const { user, updatePreferences } = useAuth();
  const [updating, setUpdating] = useState(false);

  const currentLanguage = useMemo<SupportedLanguage>(() => {
    const lang = (i18n.resolvedLanguage ?? i18n.language ?? "fr").split("-")[0];
    return SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)
      ? (lang as SupportedLanguage)
      : "fr";
  }, [i18n.language, i18n.resolvedLanguage]);

  const handleChange = useCallback(
    async (lang: SupportedLanguage) => {
      if (lang === currentLanguage || updating) return;
      setUpdating(true);
      try {
        await changeLanguage(lang);
        if (user) {
          await updatePreferences({ language: lang });
        } else if (typeof window !== "undefined") {
          window.localStorage.setItem(LOCAL_STORAGE_LANGUAGE_KEY, lang);
        }
        onLanguageChange?.(lang);
      } finally {
        setUpdating(false);
      }
    },
    [currentLanguage, updating, updatePreferences, user, onLanguageChange],
  );

  const languageOptions = useMemo(
    () => [
      {
        code: "fr" as SupportedLanguage,
        label: "FR",
        aria: t("language.french", "Français"),
      },
      {
        code: "en" as SupportedLanguage,
        label: "EN",
        aria: t("language.english", "English"),
      },
    ],
    [t],
  );

  return (
    <div className="language-switcher" role="group" aria-label={t("language.label", "Langue")}>
      {languageOptions.map(({ code, label, aria }) => (
        <button
          key={code}
          type="button"
          className={`language-switcher__btn${code === currentLanguage ? " is-active" : ""}`}
          onClick={() => void handleChange(code)}
          disabled={updating && code !== currentLanguage}
          aria-pressed={code === currentLanguage}
          aria-label={aria}
        >
          <span aria-hidden>{label}</span>
        </button>
      ))}
    </div>
  );
}

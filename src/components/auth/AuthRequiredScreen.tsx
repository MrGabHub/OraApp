import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import LanguageSwitcher from "../LanguageSwitcher";
import AuthGate from "./AuthGate";
import "./authRequired.css";

type AuthRequiredScreenProps = {
  loading: boolean;
};

export default function AuthRequiredScreen({ loading }: AuthRequiredScreenProps) {
  const { t } = useTranslation();

  return (
    <div className="auth-required">
      <div className="auth-required__orbit" aria-hidden />
      <div className="auth-required__content">
        <div className="auth-required__language">
          <LanguageSwitcher />
        </div>
        <div className="auth-required__hero">
          <div className="auth-required__badge" aria-hidden>
            <Sparkles size={loading ? 64 : 56} />
          </div>
          <div className="auth-required__text">
            <h1>{t("app.title")}</h1>
            <p>{t("auth.connect_prompt")}</p>
          </div>
        </div>
        <div className="auth-required__panel">
          <AuthGate />
        </div>
      </div>
    </div>
  );
}

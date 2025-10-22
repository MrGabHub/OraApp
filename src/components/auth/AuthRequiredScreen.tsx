import { useTranslation } from "react-i18next";
import LanguageSwitcher from "../LanguageSwitcher";
import Avatar from "../avatar";
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
        <div className="auth-required__mascot">
          <div className="auth-required__avatar">
            <Avatar mode={loading ? "success" : "normal"} />
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

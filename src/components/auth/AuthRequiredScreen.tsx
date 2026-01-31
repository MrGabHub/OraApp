import { useTranslation } from "react-i18next";
import AuthGate from "./AuthGate";
import Avatar from "../avatar";
import "./authRequired.css";

type AuthRequiredScreenProps = {
  loading: boolean;
};

export default function AuthRequiredScreen({ loading }: AuthRequiredScreenProps) {
  const { t } = useTranslation();

  return (
    <div className="auth-required" aria-busy={loading}>
      <div className="auth-required__orbit" aria-hidden />
      <div className="auth-required__content">
        <div className="auth-required__hero">
          <div className="auth-required__badge" aria-hidden>
            <Avatar mode="normal" />
          </div>
          <div className="auth-required__text">
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

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../hooks/useAuth";
import "./authGate.css";
import AuthLoading from "./AuthLoading";

export default function AuthGate() {
  const { t } = useTranslation();
  const {
    user,
    profile,
    loading,
    signInWithGoogle,
    signOut,
  } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const greetingName = profile?.displayName ?? user?.displayName ?? user?.email ?? "";
  const rolesLabel =
    profile?.roles && profile.roles.length > 0 ? t("auth.roles", { roles: profile.roles.join(", ") }) : null;

  if (loading) {
    return <AuthLoading message={t("auth.loading")} />;
  }

  if (user) {
    return (
      <div className="auth-gate auth-gate--signed">
        <div className="auth-gate__info">
          <span className="auth-gate__greeting">{t("auth.greeting", { name: greetingName })}</span>
          {rolesLabel && <span className="auth-gate__roles">{rolesLabel}</span>}
        </div>
        <button className="auth-gate__signout" type="button" onClick={() => void signOut()}>
          {t("auth.sign_out")}
        </button>
      </div>
    );
  }

  return (
    <div className="auth-gate">
      <div className="auth-gate__copy">
        <h2 className="auth-gate__title">{t("auth.sign_in")}</h2>
        <p className="auth-gate__subtitle">{t("auth.single_sign_on")}</p>
      </div>

      <button
        type="button"
        className="auth-gate__google"
        onClick={async () => {
          setError(null);
          setSubmitting(true);
          try {
            await signInWithGoogle();
          } catch (err) {
            const message =
              err instanceof Error
                ? err.message
                : t("auth.error_google", "Unable to use Google authentication.");
            setError(message);
          } finally {
            setSubmitting(false);
          }
        }}
        disabled={submitting}
      >
        {t("auth.google")}
      </button>
      {error && (
        <p className="auth-gate__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}


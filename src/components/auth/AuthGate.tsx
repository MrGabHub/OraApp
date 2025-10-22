import { FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../hooks/useAuth";
import "./authGate.css";
import AuthLoading from "./AuthLoading";

type Mode = "login" | "register";

export default function AuthGate() {
  const { t } = useTranslation();
  const {
    user,
    profile,
    loading,
    signInWithEmail,
    registerWithEmail,
    signInWithGoogle,
    signOut,
  } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        await signInWithEmail(email, password);
      } else {
        await registerWithEmail(email, password, displayName.trim() || undefined);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("auth.error", "Unable to authenticate.");
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-gate">
      <form className="auth-gate__form" onSubmit={handleSubmit}>
        <h2 className="auth-gate__title">
          {mode === "login" ? t("auth.login_title") : t("auth.register_title")}
        </h2>
        {mode === "register" && (
          <label className="auth-gate__field">
            <span>{t("auth.display_name")}</span>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder={t("auth.display_name") ?? ""}
              autoComplete="name"
            />
          </label>
        )}
        <label className="auth-gate__field">
          <span>{t("auth.email")}</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="exemple@ora.app"
            autoComplete="email"
            required
          />
        </label>
        <label className="auth-gate__field">
          <span>{t("auth.password")}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="********"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
          />
        </label>

        {error && (
          <p className="auth-gate__error" role="alert">
            {error}
          </p>
        )}

        <div className="auth-gate__actions">
          <button className="auth-gate__submit" type="submit" disabled={submitting}>
            {submitting
              ? t("auth.waiting")
              : mode === "login"
                ? t("auth.submit_login")
                : t("auth.submit_register")}
          </button>
          <button
            className="auth-gate__switch"
            type="button"
            onClick={() => setMode((prev) => (prev === "login" ? "register" : "login"))}
          >
            {mode === "login" ? t("auth.switch_to_register") : t("auth.switch_to_login")}
          </button>
        </div>
      </form>

      <div className="auth-gate__divider">
        <span>{t("auth.or")}</span>
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
    </div>
  );
}


import "./authLoading.css";
import Avatar from "../avatar";

type AuthLoadingProps = {
  message?: string;
};

export default function AuthLoading({ message = "Connexion en cours..." }: AuthLoadingProps) {
  return (
    <div className="auth-loading">
      <div className="auth-loading__avatar">
        <Avatar mode="normal" />
        <div className="auth-loading__glow" aria-hidden />
      </div>
      <p className="auth-loading__message">{message}</p>
    </div>
  );
}


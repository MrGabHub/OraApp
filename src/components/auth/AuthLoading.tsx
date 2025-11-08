import { Loader2 } from "lucide-react";
import "./authLoading.css";

type AuthLoadingProps = {
  message?: string;
};

export default function AuthLoading({ message = "Connexion en cours..." }: AuthLoadingProps) {
  return (
    <div className="auth-loading">
      <div className="auth-loading__badge" aria-hidden>
        <Loader2 className="auth-loading__spinner" size={72} />
        <div className="auth-loading__glow" aria-hidden />
      </div>
      <p className="auth-loading__message">{message}</p>
    </div>
  );
}


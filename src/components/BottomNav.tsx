import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { Home, MessageSquare, Settings } from "lucide-react";
import "./bottom-nav.css";

export type TabKey = "home" | "assistant" | "connections";

type Props = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
};

const BottomNav: FC<Props> = ({ active, onChange }) => {
  const { t } = useTranslation();

  return (
    <nav className="bottom-nav" role="navigation" aria-label={t("navigation.ariaLabel", "Navigation")}>
      <button
        className={`tab ${active === "home" ? "active" : ""}`}
        onClick={() => onChange("home")}
        aria-current={active === "home" ? "page" : undefined}
      >
        <span className="tab-icon" aria-hidden><Home /></span>
        <span className="tab-label">{t("navigation.home")}</span>
      </button>
      <button
        className={`tab ${active === "assistant" ? "active" : ""}`}
        onClick={() => onChange("assistant")}
        aria-current={active === "assistant" ? "page" : undefined}
      >
        <span className="tab-icon" aria-hidden><MessageSquare /></span>
        <span className="tab-label">{t("navigation.assistant")}</span>
      </button>
      <button
        className={`tab ${active === "connections" ? "active" : ""}`}
        onClick={() => onChange("connections")}
        aria-current={active === "connections" ? "page" : undefined}
      >
        <span className="tab-icon" aria-hidden><Settings /></span>
        <span className="tab-label">{t("navigation.connections")}</span>
      </button>
    </nav>
  );
};

export default BottomNav;

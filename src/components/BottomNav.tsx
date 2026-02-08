import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { Home, MessageCircle, Settings, Sparkles, Users } from "lucide-react";
import "./bottom-nav.css";

export type TabKey = "home" | "progress" | "assistant" | "friends" | "connections";

type Props = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
};

type NavItem = {
  key: TabKey;
  label: string;
  caption: string;
  icon: LucideIcon;
};

export default function BottomNav({ active, onChange }: Props) {
  const { t } = useTranslation();

  const navItems = useMemo<NavItem[]>(
    () => [
      {
        key: "home",
        label: t("navigation.home", "Home"),
        caption: t("navBar.home", "Overview"),
        icon: Home,
      },
      {
        key: "progress",
        label: t("navigation.progress", "Progress"),
        caption: t("navBar.progress", "Insights"),
        icon: Sparkles,
      },
      {
        key: "assistant",
        label: t("navigation.assistant", "Assistant"),
        caption: t("navBar.assistant", "Chat & plan"),
        icon: MessageCircle,
      },
      {
        key: "friends",
        label: t("navigation.friends", "Friends"),
        caption: t("navBar.friends", "Network"),
        icon: Users,
      },
      {
        key: "connections",
        label: t("navigation.connections", "Connections"),
        caption: t("navBar.connections", "Services"),
        icon: Settings,
      },
    ],
    [t],
  );

  return (
    <nav className="bottom-nav" aria-label={t("navigation.ariaLabel", "Primary navigation")}>
      {navItems.map(({ key, label, caption, icon: Icon }) => {
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            className={`bottom-nav__item${isActive ? " is-active" : ""}`}
            aria-pressed={isActive}
            onClick={() => onChange(key)}
          >
            <span className="bottom-nav__icon" aria-hidden>
              <Icon size={22} />
            </span>
            <span className="bottom-nav__label">{label}</span>
            <span className="bottom-nav__caption">{caption}</span>
          </button>
        );
      })}
    </nav>
  );
}

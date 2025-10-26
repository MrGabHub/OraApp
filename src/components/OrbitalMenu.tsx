import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { Home, MessageCircle, Settings, Sparkles } from "lucide-react";
import Avatar, { type Mode as AvatarMode } from "./avatar";
import "./orbital-menu.css";

export type TabKey = "home" | "progress" | "assistant" | "connections";

type Props = {
  active: TabKey;
  anchor: "top" | "bottom";
  avatarMode: AvatarMode;
  onChange: (tab: TabKey) => void;
};

type NavItem = {
  key: TabKey;
  label: string;
  description: string;
  angle: number;
  accentVar: string;
  icon: ComponentType<{ size?: number }>;
  offsetX: string;
  offsetY: string;
  mode: AvatarMode;
};

export default function OrbitalMenu({ active, anchor, avatarMode, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const original = document.body.style.overflow;
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
    document.body.style.overflow = original;
    return undefined;
  }, [open]);

  const navItems = useMemo<NavItem[]>(() => {
    const items: Array<Omit<NavItem, "angle">> = [
      {
        key: "home",
        label: t("navigation.home", "Accueil"),
        description: t("orbitalMenu.home", "Vue d'ensemble"),
        accentVar: "var(--accent-cyan)",
        icon: Home,
        offsetX: "var(--node-radius)",
        offsetY: "0px",
        mode: "normal",
      },
      {
        key: "progress",
        label: t("navigation.progress", "Progression"),
        description: t("orbitalMenu.progress", "Suivi de progression"),
        accentVar: "var(--accent-cyan)",
        icon: Sparkles,
        offsetX: "0px",
        offsetY: "var(--node-radius)",
        mode: "success",
      },
      {
        key: "assistant",
        label: t("navigation.assistant", "Assistant"),
        description: t("orbitalMenu.assistant", "Discuter avec ORA"),
        accentVar: "var(--accent-cyan)",
        icon: MessageCircle,
        offsetX: "calc(-1 * var(--node-radius))",
        offsetY: "0px",
        mode: "happy",
      },
      {
        key: "connections",
        label: t("navigation.connections", "Connexions"),
        description: t("orbitalMenu.connections", "Services & préférences"),
        accentVar: "var(--accent-cyan)",
        icon: Settings,
        offsetX: "0px",
        offsetY: "calc(-1 * var(--node-radius))",
        mode: "skeptic",
      },
    ];

    const slice = 360 / items.length;

    return items.map((item, index) => ({
      ...item,
      angle: index * slice - 90,
    }));
  }, [t]);

  const activeItem = useMemo(
    () => navItems.find((item) => item.key === active),
    [navItems, active],
  );

  const activeAccent = activeItem?.accentVar ?? "var(--accent-cyan)";

  const handleToggle = () => {
    setOpen((prev) => !prev);
  };

  const handleSelect = (key: TabKey) => {
    onChange(key);
    setOpen(false);
  };

  const orbitalLabel = open
    ? t("orbitalMenu.close", "Fermer le menu ORA")
    : t("orbitalMenu.open", "Ouvrir le menu ORA");

  return (
    <div
      className={`orbital-layer${open ? " orbital-layer--open" : ""}`}
      data-anchor={anchor}
      aria-hidden={false}
    >
      <div
        className="orbital-layer__backdrop"
        role="presentation"
        onClick={() => setOpen(false)}
      />
      <div
        className={`orbital-layer__orbit${open ? " orbital-layer__orbit--open" : ""}`}
        role="menu"
        aria-hidden={!open}
      >
        {navItems.map(({ key, label, angle, accentVar, icon: Icon, offsetX, offsetY }, index) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              type="button"
              className={`orbital-node${open ? " orbital-node--open" : ""}${isActive ? " orbital-node--active" : ""}`}
              style={
                {
                  "--angle": `${angle}deg`,
                  "--accent": accentVar,
                  "--offset-x": offsetX,
                  "--offset-y": offsetY,
                  transitionDelay: open ? `${index * 60}ms` : "0ms",
                } as CSSProperties
              }
              aria-label={label}
              title={label}
              onClick={() => handleSelect(key)}
              role="menuitem"
              aria-pressed={isActive}
            >
              <span className="orbital-node__icon" aria-hidden>
                <Icon size={24} />
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={`orbital-core${open ? " orbital-core--open" : ""}`}
        onClick={handleToggle}
        aria-expanded={open}
        style={{ "--accent": activeAccent } as CSSProperties}
        aria-label={orbitalLabel}
      >
        <span className="orbital-core__glow" aria-hidden />
        <span className="orbital-core__shell" aria-hidden>
          <span className="orbital-core__pulse" />
        </span>
        <span className="orbital-core__avatar" aria-hidden>
          <Avatar mode={open && activeItem ? activeItem.mode : avatarMode} />
        </span>
      </button>
    </div>
  );
}

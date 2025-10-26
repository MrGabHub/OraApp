import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, CheckCircle2, Plus } from "lucide-react";
import { useGoogleCalendar } from "../hooks/useGoogleCalendar";
import { formatRelativeTime } from "../utils/time";
import type { Mode as AvatarMode } from "./avatar";
import LanguageSwitcher from "./LanguageSwitcher";
import AuthGate from "./auth/AuthGate";
import type { SupportedLanguage } from "../lib/i18n";
import "./connections.css";

type Conn = {
  id: string;
  name: string;
  icon: LucideIcon;
  accentRgb: string; // e.g. "66,133,244"
  description: string;
  status: "connected" | "available" | "error" | "disabled";
  lastSync?: string;
  errorMessage?: string;
  connectedInfo?: string;
  loading?: boolean;
};

type Props = {
  onCelebrate?: (mode: AvatarMode) => void;
  onLanguageChange?: (lang: SupportedLanguage) => void;
};

export default function Connections({ onCelebrate, onLanguageChange }: Props) {
  const { t } = useTranslation();
  const {
    status: googleStatus,
    loading: googleLoading,
    error: googleError,
    lastSync: googleLastSync,
    profile: googleProfile,
    connect: connectGoogle,
    disconnect: disconnectGoogle,
  } = useGoogleCalendar();

  const [glowing, setGlowing] = useState<Record<string, boolean>>({});
  const lastStatusRef = useRef(googleStatus);
  const googleCard = useMemo<Conn>(() => {
    const baseLastSync = googleLastSync
      ? t("connections.google.lastSync", { time: formatRelativeTime(googleLastSync, t) })
      : undefined;
    const connectedInfo =
      googleStatus === "connected"
        ? [
            googleProfile?.email
              ? t("connections.google.connectedAs", { email: googleProfile.email })
              : t("connections.google.connected"),
            baseLastSync,
          ]
            .filter(Boolean)
            .join(" | ")
        : undefined;
    const status = googleStatus === "connected" ? "connected" : googleStatus === "error" ? "error" : "available";
    return {
      id: "gcal",
      name: "Google Calendar",
      icon: CalendarDays,
      accentRgb: "66,133,244",
      description: t("connections.google.description"),
      status,
      lastSync: baseLastSync,
      errorMessage: googleError ?? undefined,
      connectedInfo,
      loading: googleLoading,
    };
  }, [googleError, googleLastSync, googleLoading, googleProfile, googleStatus, t]);

  const cards = useMemo(() => [googleCard], [googleCard]);
  const connectedCount = cards.filter((i) => i.status === "connected").length;
  const availableCount = cards.filter((i) => i.status === "available").length;

  const toggle = (id: string) => {
    if (id === "gcal") {
      if (googleLoading) return;
      if (googleStatus === "connected") { disconnectGoogle(); } else { connectGoogle(); }
      return;
    }
    // Other integrations are not yet available.
  };

  const setIconGlow = (id: string) => {
    if (id === "gcal" && googleLoading) return;
    setGlowing((g) => ({ ...g, [id]: true }));
    setTimeout(() => {
      setGlowing((g) => ({ ...g, [id]: false }));
    }, 600);
  };

  useEffect(() => {
    const previous = lastStatusRef.current;
    if (googleStatus === "connected" && previous !== "connected") {
      onCelebrate?.("happy");
    } else if (googleStatus === "disconnected" && previous === "connected") {
      onCelebrate?.("sad");
    } else if (googleStatus === "error" && previous !== "error") {
      onCelebrate?.("angry");
    }
    lastStatusRef.current = googleStatus;
  }, [googleStatus, onCelebrate]);

  return (
    <section className="connections">
      <header className="connections-header">
        <h2>{t("connections.title")}</h2>
        <p>{t("connections.subtitle")}</p>
        <div className="connections-header__stats">
          <span className="connections-header__pill connections-header__pill--positive">
            <span className="dot" aria-hidden></span>
            {t(
              connectedCount === 1
                ? "connections.stats.connected_one"
                : "connections.stats.connected_other",
              { count: connectedCount },
            )}
          </span>
          <span className="connections-header__pill connections-header__pill--neutral">
            <span className="dot" aria-hidden></span>
            {t(
              availableCount === 1
                ? "connections.stats.available_one"
                : "connections.stats.available_other",
              { count: availableCount },
            )}
          </span>
        </div>
      </header>

      <div className="connections-header__controls">
        <LanguageSwitcher onLanguageChange={onLanguageChange} />
        <AuthGate />
      </div>

      <div className="connections-list">
        {cards.map((c) => {
          const errorDetail = c.errorMessage ? ` : ${c.errorMessage}` : "";

          return (
          <article
            key={c.id}
            className={`connection-card ${c.status}`}
            style={{
              ["--accent" as any]: `rgb(${c.accentRgb})`,
              ["--accent-rgb" as any]: c.accentRgb,
            }}
          >
            <div className="connection-card__body">
              <button
                className={`connection-card__icon ${glowing[c.id] ? "glow" : ""}`}
                aria-label={t("connections.iconLabel", { name: c.name })}
                onClick={() => setIconGlow(c.id)}
              >
                {(() => {
                  const Icon = c.icon;
                  return <Icon className="lucide" />;
                })()}
              </button>
              <div className="connection-card__meta">
                <div className="connection-card__title">
                  <h3>{c.name}</h3>
                  {c.status === "connected" && (
                    <span className="connection-card__badge" aria-label={t("general.connected")}>
                      <CheckCircle2 size={16} />
                    </span>
                  )}
                </div>
                <p className="connection-card__desc">{c.description}</p>
                <p className={`connection-card__status ${c.status}`}>
                  {c.status === "connected"
                    ? c.connectedInfo ?? t("general.connected")
                    : c.status === "error"
                    ? t("connections.status.error", { detail: errorDetail })
                    : c.status === "disabled"
                    ? t("general.comingSoon")
                    : c.loading
                    ? t("general.connecting")
                    : t("general.notConnected")}
                </p>
              </div>
            </div>
            <button
              className={`connection-card__toggle ${c.status === "connected" ? "on" : "off"}`}
              aria-pressed={c.status === "connected"}
              onClick={() => toggle(c.id)}
              disabled={c.loading || c.status === "disabled"}
              title={
                c.status === "disabled"
                  ? t("connections.tooltip.disabled")
                  : c.status === "connected"
                  ? t("connections.tooltip.connected")
                  : t("connections.tooltip.available")
              }
            />

            {c.status === "error" && (
              <div className="connection-card__error">
                <p>{c.errorMessage}</p>
                <button className="connection-card__retry" onClick={() => toggle(c.id)} disabled={c.loading}>
                  {t("general.reconnect")}
                </button>
              </div>
            )}
          </article>
        )})}
      </div>

      <div className="add-row">
        <button
          className="add-btn"
          disabled
          title={t("general.comingSoon")}
        >
          <span className="plus" aria-hidden>
            <Plus size={16} />
          </span>
          <span>{t("connections.add")}</span>
        </button>
      </div>
    </section>
  );
}


import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  Mail,
  MessageCircle,
  Instagram,
  Smartphone,
  CheckCircle2,
  Plus,
} from "lucide-react";
import { useGoogleCalendar } from "../hooks/useGoogleCalendar";
import { formatRelativeTime } from "../utils/time";
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

export default function Connections() {
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
  const items = useMemo<Conn[]>(
    () => [
      {
        id: "gmail",
        name: "Gmail",
        icon: Mail,
        accentRgb: "234,67,53",
        description: t("connections.services.gmail"),
        status: "disabled",
      },
      {
        id: "whatsapp",
        name: "WhatsApp",
        icon: MessageCircle,
        accentRgb: "37,211,102",
        description: t("connections.services.whatsapp"),
        status: "disabled",
      },
      {
        id: "instagram",
        name: "Instagram",
        icon: Instagram,
        accentRgb: "193,53,132",
        description: t("connections.services.instagram"),
        status: "disabled",
      },
      {
        id: "sms",
        name: "SMS Messages",
        icon: Smartphone,
        accentRgb: "148,163,184",
        description: t("connections.services.sms"),
        status: "disabled",
      },
    ],
    [t],
  );

  const [glowing, setGlowing] = useState<Record<string, boolean>>({});
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

  const cards = useMemo(() => [googleCard, ...items], [googleCard, items]);
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

  return (
    <section className="connections">
      <header className="connections-header">
        <h2>{t("connections.title")}</h2>
        <p>{t("connections.subtitle")}</p>
        <div className="stats">
          <span className="dot green" aria-hidden></span>
          <span className="label">
            {t(
              connectedCount === 1
                ? "connections.stats.connected_one"
                : "connections.stats.connected_other",
              { count: connectedCount },
            )}
          </span>
          <span className="dot gray" aria-hidden></span>
          <span className="label">
            {t(
              availableCount === 1
                ? "connections.stats.available_one"
                : "connections.stats.available_other",
              { count: availableCount },
            )}
          </span>
        </div>
      </header>

      <div className="list">
        {cards.map((c) => (
          <article
            key={c.id}
            className={`card ${c.status}`}
            style={{
              ["--accent" as any]: `rgb(${c.accentRgb})`,
              ["--accent-rgb" as any]: c.accentRgb,
            }}
          >
            <div className="left">
              <button
                className={`service-icon ${glowing[c.id] ? "glow" : ""}`}
                aria-label={t("connections.iconLabel", { name: c.name })}
                onClick={() => setIconGlow(c.id)}
              >
                {(() => {
                  const Icon = c.icon;
                  return <Icon className="lucide" />;
                })()}
              </button>
              <div className="meta">
                <div className="title-row">
                  <h3>{c.name}</h3>
                  {c.status === "connected" && (
                    <span className="ok" aria-label={t("general.connected")}>
                      <CheckCircle2 size={16} />
                    </span>
                  )}
                </div>
                <p className="desc">{c.description}</p>
                <p className={`sub ${c.status}`}>
                  {c.status === "connected"
                    ? c.connectedInfo ?? t("general.connected")
                    : c.status === "error"
                    ? t("connections.status.error", { detail: c.errorMessage ?? "" })
                    : c.status === "disabled"
                    ? t("general.comingSoon")
                    : c.loading
                    ? t("general.connecting")
                    : t("general.notConnected")}
                </p>
              </div>
            </div>
            <button
              className={`toggle ${c.status === "connected" ? "on" : "off"}`}
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
              <div className="error-box">
                <p>{c.errorMessage}</p>
                <button className="btn" onClick={() => toggle(c.id)} disabled={c.loading}>
                  {t("general.reconnect")}
                </button>
              </div>
            )}
          </article>
        ))}
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


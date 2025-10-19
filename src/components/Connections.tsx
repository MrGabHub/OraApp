import { useMemo, useState } from "react";
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
  const {
    status: googleStatus,
    loading: googleLoading,
    error: googleError,
    lastSync: googleLastSync,
    profile: googleProfile,
    connect: connectGoogle,
    disconnect: disconnectGoogle,
  } = useGoogleCalendar();
  const [items, setItems] = useState<Conn[]>([
    {
      id: "gmail",
      name: "Gmail",
      icon: Mail,
      accentRgb: "234,67,53",
      description: "Extract events and reminders from emails",
      status: "connected",
      lastSync: "Last sync: 5 minutes ago",
    },
    {
      id: "whatsapp",
      name: "WhatsApp",
      icon: MessageCircle,
      accentRgb: "37,211,102",
      description: "Get reminders from chat messages",
      status: "available",
    },
    {
      id: "instagram",
      name: "Instagram",
      icon: Instagram,
      accentRgb: "193,53,132",
      description: "Track social events and meetups",
      status: "error",
      lastSync: "Last sync: Failed 1 hour ago",
      errorMessage:
        "Connection failed. Check your account permissions and try again.",
    },
    {
      id: "sms",
      name: "SMS Messages",
      icon: Smartphone,
      accentRgb: "148,163,184",
      description: "Parse appointments from text messages",
      status: "disabled",
    },
  ]);

  const [glowing, setGlowing] = useState<Record<string, boolean>>({});
  const googleCard = useMemo<Conn>(() => {
    const baseLastSync = googleLastSync ? `Last sync: ${formatRelativeTime(googleLastSync)}` : undefined;
    const connectedInfo =
      googleStatus === "connected"
        ? [googleProfile?.email ? `Connected as ${googleProfile.email}` : "Connected", baseLastSync]
            .filter(Boolean)
            .join(" | ")
        : undefined;
    const status = googleStatus === "connected" ? "connected" : googleStatus === "error" ? "error" : "available";
    return {
      id: "gcal",
      name: "Google Calendar",
      icon: CalendarDays,
      accentRgb: "66,133,244",
      description: "Sync all your calendar events and meetings",
      status,
      lastSync: baseLastSync,
      errorMessage: googleError ?? undefined,
      connectedInfo,
      loading: googleLoading,
    };
  }, [googleError, googleLastSync, googleLoading, googleProfile, googleStatus]);

  const cards = useMemo(() => [googleCard, ...items], [googleCard, items]);
  const connectedCount = cards.filter((i) => i.status === "connected").length;
  const availableCount = cards.filter((i) => i.status !== "connected").length;

  const toggle = (id: string) => {
    if (id === "gcal") {
      if (googleLoading) return;
      if (googleStatus === "connected") { disconnectGoogle(); } else { connectGoogle(); }
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              status:
                i.status === "connected"
                  ? "available"
                  : i.status === "available"
                  ? "connected"
                  : i.status === "error"
                  ? "connected"
                  : "connected",
            }
          : i,
      ),
    );
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
        <h2>Connections</h2>
        <p>Manage your connected services</p>
        <div className="stats">
          <span className="dot green" aria-hidden></span>
          <span className="label">{connectedCount} connected</span>
          <span className="dot gray" aria-hidden></span>
          <span className="label">{availableCount} available</span>
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
                aria-label={`${c.name} icon`}
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
                    <span className="ok" aria-label="Connected">
                      <CheckCircle2 size={16} />
                    </span>
                  )}
                </div>
                <p className="desc">{c.description}</p>
                <p className={`sub ${c.status}`}>
                  {c.status === "connected"
                    ? c.connectedInfo ?? `Connected${c.lastSync ? `  ${c.lastSync}` : ""}`
                    : c.status === "error"
                    ? `Error  ${c.lastSync ?? ""}`
                    : c.loading
                    ? "Connecting..."
                    : "Not connected"}
                </p>
              </div>
            </div>
            <button
              className={`toggle ${c.status === "connected" ? "on" : "off"}`}
              aria-pressed={c.status === "connected"}
              onClick={() => toggle(c.id)}
              disabled={c.loading}
              title={c.status === "connected" ? "Disable" : "Enable"}
            />

            {c.status === "error" && (
              <div className="error-box">
                <p>{c.errorMessage}</p>
                <button className="btn" onClick={() => toggle(c.id)} disabled={c.loading}>
                  Reconnect
                </button>
              </div>
            )}
          </article>
        ))}
      </div>

      <div className="add-row">
        <button className="add-btn">
          <span className="plus" aria-hidden>
            <Plus size={16} />
          </span>
          <span>Add new connection</span>
        </button>
      </div>
    </section>
  );
}


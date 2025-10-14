import { useState } from "react";
import Avatar from "./components/avatar";
import Connections from "./components/Connections";
import Home from "./components/Home";
import Assistant from "./components/Assistant";
import BottomNav, { type TabKey } from "./components/BottomNav";

export default function App() {
  const [tab, setTab] = useState<TabKey>("home");
  const avatarMode: "normal" | "error" | "success" =
    tab === "home" ? "normal" : tab === "assistant" ? "error" : "success";

  return (
    <div className="app-container">
      {/* Mascotte ORA en haut (mode selon l'onglet) */}
      <Avatar mode={avatarMode} />

      {/* Contenu central selon l'onglet */}
      <main
        style={{
          width: "100%",
          maxWidth: 960,
          padding: "16px",
          boxSizing: "border-box",
          display: "grid",
          gap: 16,
        }}
      >
        {tab === "home" && <Home />}
        {tab === "assistant" && <Assistant />}
        {tab === "connections" && <Connections />}
      </main>

      {/* Barre d'onglets en bas */}
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}


import { useMemo, useRef, useState } from "react";
import "./assistant.css";

type Msg = { id: string; role: "user" | "assistant"; text: string };

export default function Assistant() {
  const [messages, setMessages] = useState<Msg[]>([
    { id: "m1", role: "assistant", text: "Hi! I’m ORA. Need help planning today?" },
    { id: "m2", role: "user", text: "Find a 45min slot before 3pm meeting." },
    { id: "m3", role: "assistant", text: "Got it. 13:45–14:30 looks free. Book it?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const system = useMemo(() => (
    "You are ORA, a concise, kind assistant focused on time planning. " +
    "Prefer short answers with concrete actions, propose times, and avoid verbosity."
  ), []);

  const send = async () => {
    if (!input.trim()) return;
    const userText = input.trim();
    setInput("");
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: userText }]);
    setLoading(true);

    try {
      // Build OpenAI-compatible messages
      const chat = [
        { role: "system", content: system },
        ...messages.map((m) => ({ role: m.role, content: m.text })),
        { role: "user", content: userText },
      ];

      const resp = await fetch("/api/grok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "grok-2-mini", messages: chat, temperature: 0.6 }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err?.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const content = data?.choices?.[0]?.message?.content?.toString?.() ?? "(no reply)";
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: content }]);
    } catch (e: any) {
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", text: `Error: ${String(e?.message || e)}` }]);
    } finally {
      setLoading(false);
      // Scroll to bottom of thread
      requestAnimationFrame(() => {
        threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") send();
  };

  return (
    <section className="assistant">
      <div className="thread" ref={threadRef}>
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>{m.text}</div>
        ))}
      </div>
      <div className="composer">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Ask ORA…"
        />
        <button onClick={send} disabled={loading}>{loading ? "…" : "Send"}</button>
      </div>
    </section>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import "./assistant.css";

type Msg = { id: string; role: "user" | "assistant"; text: string };
const DEFAULT_MODEL = "llama-3.1-8b-instant";

export default function Assistant() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const system = useMemo(
    () =>
      "You are ORA, a concise, kind assistant focused on time planning. " +
      "Prefer short answers with concrete actions, propose times, and avoid verbosity.",
    [],
  );

  useEffect(() => {
    requestAnimationFrame(() => {
      threadRef.current?.scrollTo({
        top: threadRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [messages]);

  const send = async () => {
    if (!input.trim()) return;
    const userText = input.trim();
    setInput("");
    const uid = crypto.randomUUID();
    const aid = crypto.randomUUID();
    setMessages((m) => [
      ...m,
      { id: uid, role: "user", text: userText },
      { id: aid, role: "assistant", text: "" },
    ]);
    setLoading(true);

    try {
      const chat = [
        { role: "system", content: system },
        ...messages.map((m) => ({ role: m.role, content: m.text })),
        { role: "user", content: userText },
      ];

      const resp = await fetch("/api/groq?stream=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: chat,
          temperature: 0.6,
          stream: true,
        }),
      });

      if (!resp.ok || !resp.body) {
        const errText = await resp.text().catch(() => "");
        let msg = `HTTP ${resp.status}`;
        let detail = "";
        try {
          const j = JSON.parse(errText);
          if (j?.error) msg = j.error;
          if (j?.details)
            detail = typeof j.details === "string" ? j.details : JSON.stringify(j.details);
        } catch {
          detail = errText.trim();
        }
        const cleanDetail = detail.replace(/\s+/g, " ").trim();
        throw new Error(cleanDetail ? `${msg}: ${cleanDetail}` : msg);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line) continue;
          const raw = line.split("\n").find((l) => l.startsWith("data:"));
          if (!raw) continue;
          const dataStr = raw.slice(5).trim();
          if (!dataStr || dataStr === "[DONE]") continue;
          try {
            const evt = JSON.parse(dataStr);
            const delta = evt?.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              setMessages((m) =>
                m.map((msg) => (msg.id === aid ? { ...msg, text: msg.text + delta } : msg)),
              );
            }
          } catch {
            // Ignore malformed chunks.
          }
        }
      }
    } catch (e: any) {
      setMessages((m) =>
        m.map((msg) =>
          msg.role === "assistant" && msg.text === ""
            ? { ...msg, text: `Error: ${String(e?.message || e)}` }
            : msg,
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") send();
  };

  return (
    <section className="assistant">
      <div className="thread" ref={threadRef}>
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>
            {m.text}
          </div>
        ))}
      </div>
      <div className="composer">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Ask ORA..."
        />
        <button onClick={send} disabled={loading}>
          {loading ? "..." : "Send"}
        </button>
      </div>
    </section>
  );
}


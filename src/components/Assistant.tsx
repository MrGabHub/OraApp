import { useState } from "react";
import "./assistant.css";

type Msg = { id: string; role: "user" | "assistant"; text: string };

export default function Assistant() {
  const [messages, setMessages] = useState<Msg[]>([
    { id: "m1", role: "assistant", text: "Hi! I’m ORA. Need help planning today?" },
    { id: "m2", role: "user", text: "Find a 45min slot before 3pm meeting." },
    { id: "m3", role: "assistant", text: "Got it. 13:45–14:30 looks free. Book it?" },
  ]);
  const [input, setInput] = useState("");

  const send = () => {
    if (!input.trim()) return;
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: input.trim() }]);
    setInput("");
    // Fake assistant echo
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "assistant", text: "Noted. I’ll update your plan." },
      ]);
    }, 600);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") send();
  };

  return (
    <section className="assistant">
      <div className="thread">
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
        <button onClick={send}>Send</button>
      </div>
    </section>
  );
}


import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  fetchAgentMessages,
  fetchAgents,
  fetchMe,
  loginWithTelegram,
  sendAgentMessage,
  type AgentInfo,
  type AgentMessage,
  type MeResponse,
} from "./api";

type Status = "loading" | "no-telegram" | "error" | "ready";

type Screen = { kind: "home" } | { kind: "chat"; agentKey: string };

const roleLabel: Record<MeResponse["role"], string> = {
  OWNER: "владелец",
  MEMBER: "участник",
};

export default function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [token, setToken] = useState<string>("");
  const [screen, setScreen] = useState<Screen>({ kind: "home" });

  useEffect(() => {
    async function run() {
      const tg = window.Telegram?.WebApp;

      if (!tg || !tg.initData) {
        setStatus("no-telegram");
        return;
      }

      tg.ready();
      tg.expand();

      try {
        const { token: sessionToken, user } = await loginWithTelegram(tg.initData);
        localStorage.setItem("verstak_token", sessionToken);
        setToken(sessionToken);
        setMe(user);

        const fresh = await fetchMe(sessionToken);
        setMe(fresh);
        setStatus("ready");
      } catch (err) {
        if (err instanceof ApiError) {
          setErrorMessage(err.message);
        } else if (err instanceof Error) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage("Неизвестная ошибка");
        }
        setStatus("error");
      }
    }

    run();
  }, []);

  if (status === "loading") {
    return <Centered>Входим через Telegram…</Centered>;
  }

  if (status === "no-telegram") {
    return (
      <Centered>
        Эта страница открывается только изнутри Telegram — через кнопку в
        боте.
      </Centered>
    );
  }

  if (status === "error") {
    return (
      <Centered>
        <p style={{ color: "#e5484d", marginBottom: 8 }}>Не удалось войти</p>
        <p style={{ opacity: 0.7, fontSize: 14 }}>{errorMessage}</p>
      </Centered>
    );
  }

  if (!me) {
    return <Centered>Пусто</Centered>;
  }

  if (screen.kind === "chat") {
    return (
      <AgentChat
        token={token}
        agentKey={screen.agentKey}
        onBack={() => setScreen({ kind: "home" })}
      />
    );
  }

  return (
    <Home
      me={me}
      token={token}
      onOpenAgent={(key) => setScreen({ kind: "chat", agentKey: key })}
    />
  );
}

function Home({
  me,
  token,
  onOpenAgent,
}: {
  me: MeResponse;
  token: string;
  onOpenAgent: (key: string) => void;
}) {
  const [agents, setAgents] = useState<AgentInfo[] | null>(null);
  const [agentsError, setAgentsError] = useState<string>("");

  useEffect(() => {
    fetchAgents(token)
      .then(setAgents)
      .catch((err) => {
        setAgentsError(err instanceof Error ? err.message : "Не удалось загрузить агентов");
      });
  }, [token]);

  const displayName =
    [me.firstName, me.lastName].filter(Boolean).join(" ") ||
    me.username ||
    "без имени";

  return (
    <div style={{ padding: "24px 16px", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Верстак</h1>
        <p style={{ opacity: 0.6, margin: "4px 0 0" }}>
          {displayName} · {roleLabel[me.role]} · {me.workspace.name}
        </p>
      </div>

      <h2 style={{ fontSize: 15, opacity: 0.7, fontWeight: 500, margin: "0 0 12px" }}>
        Твои ИИ-агенты
      </h2>

      {agentsError && (
        <p style={{ color: "#e5484d", fontSize: 14 }}>{agentsError}</p>
      )}

      {!agents && !agentsError && (
        <p style={{ opacity: 0.6, fontSize: 14 }}>Загружаем список…</p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {agents?.map((agent) => (
          <button
            key={agent.key}
            onClick={() => onOpenAgent(agent.key)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 6,
              padding: 16,
              borderRadius: 16,
              border: "none",
              background: "var(--tg-card-bg, rgba(127,127,127,0.08))",
              color: "var(--tg-text, inherit)",
              textAlign: "left",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            <span style={{ fontSize: 28 }}>{agent.emoji}</span>
            <span style={{ fontWeight: 600 }}>{agent.name}</span>
            <span style={{ fontSize: 12, opacity: 0.6 }}>{agent.tagline}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function AgentChat({
  token,
  agentKey,
  onBack,
}: {
  token: string;
  agentKey: string;
  onBack: () => void;
}) {
  const [messages, setMessages] = useState<AgentMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string>("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAgentMessages(token, agentKey)
      .then(setMessages)
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Не удалось загрузить переписку");
      });
  }, [token, agentKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function handleSend() {
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    setSendError("");
    setDraft("");

    const optimisticId = `optimistic-${Date.now()}`;
    setMessages((prev) => [
      ...(prev ?? []),
      { id: optimisticId, role: "user", content, createdAt: new Date().toISOString() },
    ]);

    try {
      const { assistantMessage } = await sendAgentMessage(token, agentKey, content);
      setMessages((prev) => [...(prev ?? []), assistantMessage]);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Не удалось отправить сообщение");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        maxWidth: 480,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px",
          borderBottom: "1px solid var(--tg-card-bg, rgba(127,127,127,0.15))",
        }}
      >
        <button
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: "var(--tg-button, #2ea6ff)",
            font: "inherit",
            cursor: "pointer",
            padding: 0,
          }}
        >
          ← Назад
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {loadError && <p style={{ color: "#e5484d", fontSize: 14 }}>{loadError}</p>}

        {!messages && !loadError && (
          <p style={{ opacity: 0.6, fontSize: 14 }}>Загружаем переписку…</p>
        )}

        {messages?.length === 0 && (
          <p style={{ opacity: 0.6, fontSize: 14 }}>
            Начни разговор — задай вопрос агенту.
          </p>
        )}

        {messages?.map((m) => (
          <div
            key={m.id}
            style={{
              display: "flex",
              justifyContent: m.role === "user" ? "flex-end" : "flex-start",
              marginBottom: 10,
            }}
          >
            <div
              style={{
                maxWidth: "80%",
                padding: "10px 14px",
                borderRadius: 14,
                whiteSpace: "pre-wrap",
                background:
                  m.role === "user"
                    ? "var(--tg-button, #2ea6ff)"
                    : "var(--tg-card-bg, rgba(127,127,127,0.12))",
                color: m.role === "user" ? "var(--tg-button-text, #ffffff)" : "inherit",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}

        {sending && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 10 }}>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 14,
                background: "var(--tg-card-bg, rgba(127,127,127,0.12))",
                opacity: 0.6,
                fontSize: 14,
              }}
            >
              печатает…
            </div>
          </div>
        )}

        {sendError && <p style={{ color: "#e5484d", fontSize: 14 }}>{sendError}</p>}

        <div ref={bottomRef} />
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          padding: 12,
          borderTop: "1px solid var(--tg-card-bg, rgba(127,127,127,0.15))",
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Напиши сообщение…"
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 20,
            border: "1px solid var(--tg-card-bg, rgba(127,127,127,0.2))",
            background: "transparent",
            color: "inherit",
            font: "inherit",
            outline: "none",
          }}
        />
        <button
          onClick={handleSend}
          disabled={sending || !draft.trim()}
          style={{
            padding: "10px 18px",
            borderRadius: 20,
            border: "none",
            background: "var(--tg-button, #2ea6ff)",
            color: "var(--tg-button-text, #ffffff)",
            font: "inherit",
            fontWeight: 600,
            cursor: sending || !draft.trim() ? "default" : "pointer",
            opacity: sending || !draft.trim() ? 0.5 : 1,
          }}
        >
          Отправить
        </button>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 24,
        fontFamily:
          "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif",
      }}
    >
      {children}
    </div>
  );
}

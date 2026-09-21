import { useEffect, useRef, useState } from "react";
import {
  ApiError,
  createTask,
  deleteTask,
  fetchAgentMessages,
  fetchAgents,
  fetchMe,
  fetchTasks,
  loginWithTelegram,
  sendAgentMessage,
  updateTask,
  type AgentInfo,
  type AgentMessage,
  type MeResponse,
  type Task,
} from "./api";

type Status = "loading" | "no-telegram" | "error" | "ready";

type Screen =
  | { kind: "home" }
  | { kind: "chat"; agentKey: string; prefill?: string }
  | { kind: "tasks" }
  | { kind: "task"; taskId: string };

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
        prefill={screen.prefill}
        onBack={() => setScreen({ kind: "home" })}
      />
    );
  }

  if (screen.kind === "tasks") {
    return (
      <Tasks
        token={token}
        onBack={() => setScreen({ kind: "home" })}
        onOpenTask={(taskId) => setScreen({ kind: "task", taskId })}
      />
    );
  }

  if (screen.kind === "task") {
    return (
      <TaskDetail
        token={token}
        taskId={screen.taskId}
        onBack={() => setScreen({ kind: "tasks" })}
        onDiscussWithAgent={(agentKey, prefill) => setScreen({ kind: "chat", agentKey, prefill })}
      />
    );
  }

  return (
    <Home
      me={me}
      token={token}
      onOpenAgent={(key) => setScreen({ kind: "chat", agentKey: key })}
      onOpenTasks={() => setScreen({ kind: "tasks" })}
    />
  );
}

function Home({
  me,
  token,
  onOpenAgent,
  onOpenTasks,
}: {
  me: MeResponse;
  token: string;
  onOpenAgent: (key: string) => void;
  onOpenTasks: () => void;
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

      <button
        onClick={onOpenTasks}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          padding: 14,
          borderRadius: 14,
          border: "none",
          background: "var(--tg-card-bg, rgba(127,127,127,0.08))",
          color: "var(--tg-text, inherit)",
          font: "inherit",
          fontWeight: 600,
          cursor: "pointer",
          marginBottom: 20,
        }}
      >
        <span>📋 Задачи</span>
        <span style={{ opacity: 0.5 }}>→</span>
      </button>

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
  prefill,
  onBack,
}: {
  token: string;
  agentKey: string;
  prefill?: string;
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

  useEffect(() => {
    if (prefill) setDraft(prefill);
  }, [prefill]);

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

const AGENT_OPTIONS: { key: string; emoji: string; name: string }[] = [
  { key: "designer", emoji: "🎨", name: "Дизайнер" },
  { key: "financier", emoji: "💰", name: "Финансист" },
  { key: "lawyer", emoji: "⚖️", name: "Юрист" },
  { key: "marketer", emoji: "📣", name: "Маркетолог" },
];

const PROJECT_LABEL: Record<string, string> = {
  METALIZM: "METALIZM",
  PRINTBAR: "Принт Бар",
  SPRINTAMI: "Спринтами",
  OTHER: "Другое",
};

const STATUS_LABEL: Record<string, string> = {
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  DONE: "Готово",
};

// Отдельный раздел верстака: задачи, которые может заводить и человек, и
// ИИ-агенты (через tool use в чате). С карточки задачи есть мостик в чат
// нужного агента — без этого агенты и задачи жили бы в двух не связанных мирах.
function Tasks({
  token,
  onBack,
  onOpenTask,
}: {
  token: string;
  onBack: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("OTHER");
  const [creating, setCreating] = useState(false);

  function reload() {
    fetchTasks(token)
      .then((res) => setTasks(res.tasks))
      .catch((err) => setError(err instanceof Error ? err.message : "Не удалось загрузить задачи"));
  }

  useEffect(() => {
    reload();
  }, [token]);

  async function handleCreate() {
    const t = title.trim();
    if (!t || creating) return;
    setCreating(true);
    try {
      await createTask(token, { title: t, project });
      setTitle("");
      setShowForm(false);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать задачу");
    } finally {
      setCreating(false);
    }
  }

  const groups: { status: string; label: string }[] = [
    { status: "NEW", label: "Новые" },
    { status: "IN_PROGRESS", label: "В работе" },
    { status: "DONE", label: "Готово" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", maxWidth: 480, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 16,
          borderBottom: "1px solid var(--tg-card-bg, rgba(127,127,127,0.15))",
        }}
      >
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", color: "var(--tg-button, #2ea6ff)", font: "inherit", cursor: "pointer", padding: 0 }}
        >
          ← Назад
        </button>
        <h1 style={{ fontSize: 18, margin: 0, flex: 1 }}>Задачи</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          style={{
            background: "var(--tg-button, #2ea6ff)",
            color: "var(--tg-button-text, #ffffff)",
            border: "none",
            borderRadius: 16,
            width: 32,
            height: 32,
            fontSize: 18,
            cursor: "pointer",
          }}
        >
          +
        </button>
      </div>

      {showForm && (
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid var(--tg-card-bg, rgba(127,127,127,0.15))",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Название задачи"
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(127,127,127,0.3)", font: "inherit" }}
          />
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(127,127,127,0.3)", font: "inherit" }}
          >
            <option value="METALIZM">METALIZM</option>
            <option value="PRINTBAR">Принт Бар</option>
            <option value="SPRINTAMI">Спринтами</option>
            <option value="OTHER">Другое</option>
          </select>
          <button
            onClick={handleCreate}
            disabled={creating || !title.trim()}
            style={{
              padding: "10px 18px",
              borderRadius: 20,
              border: "none",
              background: "var(--tg-button, #2ea6ff)",
              color: "var(--tg-button-text, #ffffff)",
              font: "inherit",
              fontWeight: 600,
              cursor: creating ? "default" : "pointer",
              opacity: creating || !title.trim() ? 0.5 : 1,
            }}
          >
            Создать
          </button>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {error && <p style={{ color: "#e5484d", fontSize: 14 }}>{error}</p>}
        {!tasks && !error && <p style={{ opacity: 0.6, fontSize: 14 }}>Загружаем задачи…</p>}
        {tasks && tasks.length === 0 && (
          <p style={{ opacity: 0.6, fontSize: 14 }}>Пока нет задач — нажми «+», чтобы создать первую.</p>
        )}

        {groups.map((group) => {
          const items = (tasks ?? []).filter((t) => t.status === group.status);
          if (items.length === 0) return null;
          return (
            <div key={group.status} style={{ marginBottom: 20 }}>
              <h2 style={{ fontSize: 14, opacity: 0.7, fontWeight: 500, margin: "0 0 8px" }}>
                {group.label}
              </h2>
              {items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onOpenTask(t.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: 12,
                    borderRadius: 12,
                    border: "none",
                    background: "var(--tg-card-bg, rgba(127,127,127,0.08))",
                    color: "var(--tg-text, inherit)",
                    font: "inherit",
                    cursor: "pointer",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{t.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                    {PROJECT_LABEL[t.project] ?? t.project}
                    {t.createdByAgentKey ? ` · создано агентом ${t.createdByAgentKey}` : ""}
                    {t.dueDate ? ` · до ${new Date(t.dueDate).toLocaleDateString("ru-RU")}` : ""}
                  </div>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Карточка одной задачи: статус, чек-лист и мостик "Обсудить с агентом" —
// открывает чат нужного агента с готовым первым сообщением про эту задачу.
function TaskDetail({
  token,
  taskId,
  onBack,
  onDiscussWithAgent,
}: {
  token: string;
  taskId: string;
  onBack: () => void;
  onDiscussWithAgent: (agentKey: string, prefill: string) => void;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchTasks(token)
      .then((res) => setTasks(res.tasks))
      .catch((err) => setError(err instanceof Error ? err.message : "Не удалось загрузить задачу"));
  }, [token]);

  const task = tasks?.find((t) => t.id === taskId);

  async function setStatus(status: string) {
    if (!task) return;
    setSaving(true);
    try {
      const { task: updated } = await updateTask(token, task.id, { status });
      setTasks((prev) => (prev ?? []).map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить задачу");
    } finally {
      setSaving(false);
    }
  }

  async function toggleChecklistItem(index: number) {
    if (!task || !task.checklist) return;
    const next = task.checklist.map((item, i) => (i === index ? { ...item, done: !item.done } : item));
    setSaving(true);
    try {
      const { task: updated } = await updateTask(token, task.id, { checklist: next });
      setTasks((prev) => (prev ?? []).map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось обновить чек-лист");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    setSaving(true);
    try {
      await deleteTask(token, task.id);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить задачу");
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", maxWidth: 480, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 16,
          borderBottom: "1px solid var(--tg-card-bg, rgba(127,127,127,0.15))",
        }}
      >
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", color: "var(--tg-button, #2ea6ff)", font: "inherit", cursor: "pointer", padding: 0 }}
        >
          ← Назад
        </button>
        <h1 style={{ fontSize: 18, margin: 0, flex: 1 }}>Задача</h1>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {error && <p style={{ color: "#e5484d", fontSize: 14 }}>{error}</p>}
        {!task && !error && <p style={{ opacity: 0.6, fontSize: 14 }}>Загружаем…</p>}

        {task && (
          <>
            <h2 style={{ fontSize: 20, margin: "0 0 8px" }}>{task.title}</h2>
            {task.description && <p style={{ opacity: 0.8, marginBottom: 12 }}>{task.description}</p>}
            <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 16 }}>
              {PROJECT_LABEL[task.project] ?? task.project}
              {task.dueDate ? ` · до ${new Date(task.dueDate).toLocaleDateString("ru-RU")}` : ""}
              {task.createdByAgentKey ? ` · создано агентом ${task.createdByAgentKey}` : ""}
            </p>

            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {["NEW", "IN_PROGRESS", "DONE"].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  disabled={saving}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 14,
                    border: "none",
                    background:
                      task.status === s
                        ? "var(--tg-button, #2ea6ff)"
                        : "var(--tg-card-bg, rgba(127,127,127,0.08))",
                    color: task.status === s ? "var(--tg-button-text, #ffffff)" : "var(--tg-text, inherit)",
                    font: "inherit",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>

            {task.checklist && task.checklist.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 14, opacity: 0.7, margin: "0 0 8px" }}>Чек-лист</h3>
                {task.checklist.map((item, i) => (
                  <label
                    key={i}
                    style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}
                  >
                    <input type="checkbox" checked={item.done} onChange={() => toggleChecklistItem(i)} />
                    <span style={{ textDecoration: item.done ? "line-through" : "none", opacity: item.done ? 0.6 : 1 }}>
                      {item.text}
                    </span>
                  </label>
                ))}
              </div>
            )}

            <h3 style={{ fontSize: 14, opacity: 0.7, margin: "0 0 8px" }}>Обсудить с агентом</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
              {AGENT_OPTIONS.map((a) => (
                <button
                  key={a.key}
                  onClick={() =>
                    onDiscussWithAgent(
                      a.key,
                      `Смотрю задачу «${task.title}»${
                        task.dueDate ? `, срок — ${new Date(task.dueDate).toLocaleDateString("ru-RU")}` : ""
                      }. Что скажешь?`
                    )
                  }
                  style={{
                    padding: "8px 14px",
                    borderRadius: 16,
                    border: "none",
                    background: "var(--tg-card-bg, rgba(127,127,127,0.08))",
                    color: "var(--tg-text, inherit)",
                    font: "inherit",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {a.emoji} {a.name}
                </button>
              ))}
            </div>

            <button
              onClick={handleDelete}
              disabled={saving}
              style={{
                padding: "8px 14px",
                borderRadius: 16,
                border: "none",
                background: "none",
                color: "#e5484d",
                font: "inherit",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Удалить задачу
            </button>
          </>
        )}
      </div>
    </div>
  );
}

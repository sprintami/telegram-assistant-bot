import { useEffect, useState } from "react";
import { ApiError, fetchMe, loginWithTelegram, type MeResponse } from "./api";

type Status = "loading" | "no-telegram" | "error" | "ready";

const roleLabel: Record<MeResponse["role"], string> = {
  OWNER: "владелец",
  MEMBER: "участник",
};

export default function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [me, setMe] = useState<MeResponse | null>(null);

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
        const { token, user } = await loginWithTelegram(tg.initData);
        localStorage.setItem("verstak_token", token);
        setMe(user);

        // Подстрахуемся и подтянем свежие данные через /me,
        // чтобы проверить всю цепочку авторизации целиком.
        const fresh = await fetchMe(token);
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

  const displayName = [me.firstName, me.lastName].filter(Boolean).join(" ") ||
    me.username ||
    "без имени";

  return (
    <Centered>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Верстак</h1>
      <p style={{ opacity: 0.6, marginBottom: 24 }}>тестовый вход · P0</p>

      <Card>
        <Row label="Имя" value={displayName} />
        <Row label="Username" value={me.username ? `@${me.username}` : "—"} />
        <Row label="Роль" value={roleLabel[me.role]} />
        <Row label="Воркспейс" value={me.workspace.name} />
      </Card>
    </Centered>
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
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 320,
        background: "rgba(127,127,127,0.08)",
        borderRadius: 16,
        padding: 20,
        textAlign: "left",
      }}
    >
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: "1px solid rgba(127,127,127,0.15)",
      }}
    >
      <span style={{ opacity: 0.6, fontSize: 14 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  );
}

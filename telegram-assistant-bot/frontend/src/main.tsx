import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

function applyTelegramTheme() {
  const tg = window.Telegram?.WebApp;
  const theme = tg?.themeParams ?? {};

  const bg = theme.bg_color ?? "#ffffff";
  const text = theme.text_color ?? "#111111";
  const hint = theme.hint_color ?? "#707579";
  const cardBg = theme.secondary_bg_color ?? "rgba(127,127,127,0.08)";

  const root = document.documentElement;
  root.style.setProperty("--tg-bg", bg);
  root.style.setProperty("--tg-text", text);
  root.style.setProperty("--tg-hint", hint);
  root.style.setProperty("--tg-card-bg", cardBg);

  // Явно задаём фон/текст страницы под текущую тему Telegram,
  // чтобы текст не сливался с фоном в тёмной теме.
  document.body.style.background = bg;
  document.body.style.color = text;
}

applyTelegramTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

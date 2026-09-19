import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { env } from "./env.js";

mkdirSync(dirname(env.DB_PATH), { recursive: true });
const db = new Database(env.DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  create table if not exists bot_profile (
    telegram_id integer primary key,
    profile_text text not null default '',
    updated_at text not null default (datetime('now'))
  );

  create table if not exists bot_messages (
    id integer primary key autoincrement,
    telegram_id integer not null references bot_profile(telegram_id) on delete cascade,
    role text not null,
    content text not null,
    created_at text not null default (datetime('now'))
  );

  create index if not exists idx_bot_messages_telegram_id
    on bot_messages (telegram_id, id);

  create table if not exists bot_memory_summary (
    telegram_id integer primary key references bot_profile(telegram_id) on delete cascade,
    summary_text text not null default '',
    summarized_through_message_id integer not null default 0,
    updated_at text not null default (datetime('now'))
  );
`);

export interface BotProfile {
  telegram_id: number;
  profile_text: string;
}

export interface StoredMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
}

export function getOrCreateProfile(telegramId: number): BotProfile {
  const existing = db
    .prepare("select telegram_id, profile_text from bot_profile where telegram_id = ?")
    .get(telegramId) as BotProfile | undefined;
  if (existing) return existing;

  db.prepare("insert into bot_profile (telegram_id, profile_text) values (?, '')").run(telegramId);
  return { telegram_id: telegramId, profile_text: "" };
}

export function replaceProfile(telegramId: number, text: string) {
  getOrCreateProfile(telegramId);
  db.prepare("update bot_profile set profile_text = ?, updated_at = datetime('now') where telegram_id = ?").run(
    text,
    telegramId
  );
}

export function appendToProfile(telegramId: number, addition: string) {
  const current = getOrCreateProfile(telegramId);
  const merged = current.profile_text ? `${current.profile_text}\n${addition}` : addition;
  replaceProfile(telegramId, merged);
}

export function saveMessage(telegramId: number, role: "user" | "assistant", content: string) {
  getOrCreateProfile(telegramId);
  db.prepare("insert into bot_messages (telegram_id, role, content) values (?, ?, ?)").run(
    telegramId,
    role,
    content
  );
}

// Последние N сообщений — то, что реально уходит в контекст Claude
export function getRecentMessages(telegramId: number, limit = 30): StoredMessage[] {
  const rows = db
    .prepare(
      "select id, role, content from bot_messages where telegram_id = ? order by id desc limit ?"
    )
    .all(telegramId, limit) as StoredMessage[];
  return rows.reverse();
}

export function getSummary(telegramId: number): string {
  const row = db
    .prepare("select summary_text from bot_memory_summary where telegram_id = ?")
    .get(telegramId) as { summary_text: string } | undefined;
  return row?.summary_text ?? "";
}

export function getSummarizedThroughId(telegramId: number): number {
  const row = db
    .prepare("select summarized_through_message_id from bot_memory_summary where telegram_id = ?")
    .get(telegramId) as { summarized_through_message_id: number } | undefined;
  return row?.summarized_through_message_id ?? 0;
}

export function getMessagesAfter(telegramId: number, afterId: number): StoredMessage[] {
  return db
    .prepare(
      "select id, role, content from bot_messages where telegram_id = ? and id > ? order by id asc"
    )
    .all(telegramId, afterId) as StoredMessage[];
}

export function saveSummary(telegramId: number, summaryText: string, throughMessageId: number) {
  db.prepare(
    `insert into bot_memory_summary (telegram_id, summary_text, summarized_through_message_id, updated_at)
     values (?, ?, ?, datetime('now'))
     on conflict(telegram_id) do update set
       summary_text = excluded.summary_text,
       summarized_through_message_id = excluded.summarized_through_message_id,
       updated_at = datetime('now')`
  ).run(telegramId, summaryText, throughMessageId);
}

import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { env } from "../env.js";

// Служебный (server-to-server) доступ к данным верстака для личного
// Telegram-бота владельца (см. telegram-assistant-bot/src/ai.ts, инструмент
// get_verstak_data). У бота нет браузера и нет обычного входа через Telegram
// Mini App (initData -> JWT, см. middleware/requireAuth.ts), поэтому здесь
// отдельная проверка: общий секрет в заголовке, известный только двум
// сервисам (бэкенду и боту). Доступ read-only и всегда по конкретному
// telegramId -> его workspaceId — так бот физически не может прочитать
// данные чужого воркспейса, даже если бы захотел.

const RECORD_MODULES = [
  "sales",
  "production",
  "finance",
  "documents",
  "regulations",
  "goals",
  "knowledge",
];
const ALL_MODULES = ["tasks", ...RECORD_MODULES];

function toApi(row: { id: string; data: unknown }) {
  return { id: row.id, ...(typeof row.data === "object" && row.data ? (row.data as object) : {}) };
}

export async function internalRoutes(app: FastifyInstance) {
  // Путь НЕ начинается с "/internal/" намеренно: запросы к "/internal/*" молча
  // перехватываются где-то перед Fastify-приложением (похоже, зарезервированный
  // префикс на стороне Railway/edge) и никогда не доходят до сервера — при
  // проверке "/internal" в одиночку доходил и корректно давал 404 "not found",
  // а "/internal/context" — нет, ни разу не попав в логи приложения. Поэтому
  // используем отдельный от "/internal" префикс.
  app.get("/verstak-context", async (request, reply) => {
    const secret = request.headers["x-internal-secret"];
    if (!secret || secret !== env.INTERNAL_API_KEY) {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const { telegramId, modules } = request.query as { telegramId?: string; modules?: string };
    if (!telegramId) {
      return reply.code(400).send({ error: "telegramId required" });
    }

    const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
    if (!user) {
      return reply.code(404).send({ error: "user not found" });
    }

    const requested = modules
      ? modules
          .split(",")
          .map((m) => m.trim())
          .filter((m) => ALL_MODULES.includes(m))
      : ALL_MODULES;

    const result: Record<string, unknown> = {};

    if (requested.includes("tasks")) {
      result.tasks = await prisma.task.findMany({
        where: { workspaceId: user.workspaceId },
        orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      });
    }

    const recordModules = requested.filter((m) => RECORD_MODULES.includes(m));
    if (recordModules.length) {
      const rows = await prisma.record.findMany({
        where: { workspaceId: user.workspaceId, module: { in: recordModules } },
        orderBy: { createdAt: "desc" },
      });
      for (const m of recordModules) {
        result[m] = rows.filter((r: { module: string }) => r.module === m).map(toApi);
      }
    }

    return result;
  });
}

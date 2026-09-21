import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";

// Универсальный CRUD для разделов верстака, которые фронтенд трактует
// одинаково (см. MODULE_DEFS в public/index.html): Продажи, Производство,
// Выручка, Документы, Регламенты, Цели компании. Каждая запись — id
// (клиентский, как у Task) + произвольный JSON `data`; наружу отдаём
// { id, ...data }, ровно то, что ждёт фронтенд (было бы doc.data() у
// Firestore-подобной коллекции артефакта).

const VALID_MODULES = [
  "sales",
  "production",
  "finance",
  "documents",
  "regulations",
  "goals",
];

function toApi(row: { id: string; data: unknown }) {
  return { id: row.id, ...(typeof row.data === "object" && row.data ? (row.data as object) : {}) };
}

export async function recordsRoutes(app: FastifyInstance) {
  app.get("/records/:module", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = request.session!;
    const { module: moduleKey } = request.params as { module: string };
    if (!VALID_MODULES.includes(moduleKey)) {
      return reply.code(404).send({ error: "unknown module" });
    }

    const rows = await prisma.record.findMany({
      where: { workspaceId, module: moduleKey },
      orderBy: { createdAt: "desc" },
    });

    return { records: rows.map(toApi) };
  });

  // Создание, а если body.id уже существует — апдейт (то же upsert-по-id,
  // что и у /tasks — фронтенд работает в стиле doc(id).set(...)).
  app.post("/records/:module", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = request.session!;
    const { module: moduleKey } = request.params as { module: string };
    if (!VALID_MODULES.includes(moduleKey)) {
      return reply.code(404).send({ error: "unknown module" });
    }

    const body = request.body as { id?: string } & Record<string, unknown>;
    if (!body.id) {
      return reply.code(400).send({ error: "id is required" });
    }
    const { id, ...data } = body;

    const existing = await prisma.record.findFirst({ where: { id, workspaceId, module: moduleKey } });
    const row = existing
      ? await prisma.record.update({ where: { id }, data: { data: data as Prisma.InputJsonValue } })
      : await prisma.record.create({
          data: { id, workspaceId, module: moduleKey, data: data as Prisma.InputJsonValue },
        });

    return reply.code(existing ? 200 : 201).send({ record: toApi(row) });
  });

  app.patch("/records/:module/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = request.session!;
    const { module: moduleKey, id } = request.params as { module: string; id: string };
    if (!VALID_MODULES.includes(moduleKey)) {
      return reply.code(404).send({ error: "unknown module" });
    }

    const existing = await prisma.record.findFirst({ where: { id, workspaceId, module: moduleKey } });
    if (!existing) {
      return reply.code(404).send({ error: "record not found" });
    }

    const patch = request.body as Record<string, unknown>;
    const data = { ...((existing.data as any) ?? {}), ...patch };
    const row = await prisma.record.update({
      where: { id },
      data: { data: data as Prisma.InputJsonValue },
    });

    return { record: toApi(row) };
  });

  app.delete("/records/:module/:id", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = request.session!;
    const { module: moduleKey, id } = request.params as { module: string; id: string };
    if (!VALID_MODULES.includes(moduleKey)) {
      return reply.code(404).send({ error: "unknown module" });
    }

    const existing = await prisma.record.findFirst({ where: { id, workspaceId, module: moduleKey } });
    if (!existing) {
      return reply.code(404).send({ error: "record not found" });
    }

    await prisma.record.delete({ where: { id } });
    return reply.code(204).send();
  });
}

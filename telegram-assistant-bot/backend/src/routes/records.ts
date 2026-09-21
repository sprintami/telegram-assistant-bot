import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";

// Generic CRUD for the verstak sections the frontend treats the same way
// (see MODULE_DEFS in public/index.html): sales, production, finance,
// documents, regulations, company goals. Each record is a client-generated
// id (like Task) plus arbitrary JSON `data`; outward we return { id, ...data },
// exactly what the frontend expects (what doc.data() used to be on the
// old artifact's Firestore-like collection).

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

  // Create, or update if body.id already exists (same upsert-by-id as
  // /tasks - the frontend works in a doc(id).set(...) style).
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
          ? await prisma.record.update({ where: { id }, data: { data } })
                : await prisma.record.create({ data: { id, workspaceId, module: moduleKey, data } });

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
        const row = await prisma.record.update({ where: { id }, data: { data } });

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

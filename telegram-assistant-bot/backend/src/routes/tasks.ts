import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";

// Verstak tasks: a general section, not tied to any one agent. A task can
// be created/edited by a human through this API, or by the assistant via
// tool use in chat - both paths go through the same prisma calls below.

const VALID_PROJECTS = ["METALIZM", "PRINTBAR", "SPRINTAMI", "OTHER"];
const VALID_LEVERS = ["SALES", "OPS", "SCALE"];
const VALID_STATUSES = ["NEW", "IN_PROGRESS", "DONE"];

export async function tasksRoutes(app: FastifyInstance) {
    app.get("/tasks", { preHandler: requireAuth }, async (request) => {
          const { workspaceId } = request.session!;
          const { project, status } = request.query as { project?: string; status?: string };

                const tasks = await prisma.task.findMany({
                        where: {
                                  workspaceId,
                                  ...(project ? { project: project as any } : {}),
                                  ...(status ? { status: status as any } : {}),
                        },
                        orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
                });

                return { tasks };
    });

  // Create, or update if body.id already exists in this workspace (upsert
  // by client-generated id) - this lets the frontend work in a
  // doc(id).set(...) style: it invents the id itself and does not need to
  // know in advance whether it is creating a task or overwriting one.
  app.post("/tasks", { preHandler: requireAuth }, async (request, reply) => {
        const { workspaceId } = request.session!;
        const body = request.body as {
                id?: string;
                title?: string;
                description?: string;
                project?: string;
                lever?: string;
                status?: string;
                dueDate?: string | null;
                checklist?: { text: string; done: boolean }[];
                extraPatch?: Record<string, unknown>;
                createdByAgentKey?: string;
        };

               if (!body.id) {
                       return reply.code(400).send({ error: "id is required" });
               }
        if (!body.title || !body.title.trim()) {
                return reply.code(400).send({ error: "title is required" });
        }
        if (body.project && !VALID_PROJECTS.includes(body.project)) {
                return reply.code(400).send({ error: "invalid project" });
        }
        if (body.lever && !VALID_LEVERS.includes(body.lever)) {
                return reply.code(400).send({ error: "invalid lever" });
        }
        if (body.status && !VALID_STATUSES.includes(body.status)) {
                return reply.code(400).send({ error: "invalid status" });
        }

               const existing = body.id
          ? await prisma.task.findFirst({ where: { id: body.id, workspaceId } })
                       : null;

               const data = {
                       title: body.title.trim(),
                       description: body.description,
                       project: (body.project as any) ?? "OTHER",
                       lever: body.lever as any,
                       status: (body.status as any) ?? undefined,
                       dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
                       checklist: body.checklist ?? undefined,
                       createdByAgentKey: body.createdByAgentKey,
               };

               if (existing) {
                       const extra = body.extraPatch
                         ? { ...((existing.extra as any) ?? {}), ...body.extraPatch }
                                 : undefined;
                       const task = await prisma.task.update({
                                 where: { id: existing.id },
                                 data: { ...data, ...(extra !== undefined ? { extra } : {}) },
                       });
                       return reply.send({ task });
               }

               const task = await prisma.task.create({
                       data: {
                                 ...data,
                                 id: body.id,
                                 workspaceId,
                                 extra: body.extraPatch ?? undefined,
                       },
               });

               return reply.code(201).send({ task });
  });

  app.patch("/tasks/:id", { preHandler: requireAuth }, async (request, reply) => {
        const { workspaceId } = request.session!;
        const { id } = request.params as { id: string };
        const body = request.body as {
                title?: string;
                description?: string;
                project?: string;
                lever?: string;
                status?: string;
                dueDate?: string | null;
                checklist?: { text: string; done: boolean }[];
                extraPatch?: Record<string, unknown>;
        };

                const existing = await prisma.task.findFirst({ where: { id, workspaceId } });
        if (!existing) {
                return reply.code(404).send({ error: "task not found" });
        }
        if (body.project && !VALID_PROJECTS.includes(body.project)) {
                return reply.code(400).send({ error: "invalid project" });
        }
        if (body.lever && !VALID_LEVERS.includes(body.lever)) {
                return reply.code(400).send({ error: "invalid lever" });
        }
        if (body.status && !VALID_STATUSES.includes(body.status)) {
                return reply.code(400).send({ error: "invalid status" });
        }

                const task = await prisma.task.update({
                        where: { id },
                        data: {
                                  ...(body.title !== undefined ? { title: body.title } : {}),
                                  ...(body.description !== undefined ? { description: body.description } : {}),
                                  ...(body.project !== undefined ? { project: body.project as any } : {}),
                                  ...(body.lever !== undefined ? { lever: body.lever as any } : {}),
                                  ...(body.status !== undefined ? { status: body.status as any } : {}),
                                  ...(body.dueDate !== undefined
                                                ? { dueDate: body.dueDate ? new Date(body.dueDate) : null }
                                                : {}),
                                  ...(body.checklist !== undefined ? { checklist: body.checklist } : {}),
                                  ...(body.extraPatch !== undefined
                                                ? { extra: { ...((existing.extra as any) ?? {}), ...body.extraPatch } }
                                                : {}),
                        },
                });

                return { task };
  });

  app.delete("/tasks/:id", { preHandler: requireAuth }, async (request, reply) => {
        const { workspaceId } = request.session!;
        const { id } = request.params as { id: string };

                 const existing = await prisma.task.findFirst({ where: { id, workspaceId } });
        if (!existing) {
                return reply.code(404).send({ error: "task not found" });
        }

                 await prisma.task.delete({ where: { id } });
        return reply.code(204).send();
  });
}

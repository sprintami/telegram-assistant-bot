import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";

// Задачи верстака: общий раздел, не привязанный к конкретному агенту.
// Задачу может создать/изменить как человек через этот API, так и
// ИИ-агент через tool use в чате (см. src/tools/tasks.ts + src/claude.ts) —
// оба пути идут через одни и те же prisma-запросы ниже.

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

  app.post("/tasks", { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = request.session!;
    const body = request.body as {
      title?: string;
      description?: string;
      project?: string;
      lever?: string;
      dueDate?: string;
      checklist?: { text: string; done: boolean }[];
      createdByAgentKey?: string;
    };

    if (!body.title || !body.title.trim()) {
      return reply.code(400).send({ error: "title is required" });
    }
    if (body.project && !VALID_PROJECTS.includes(body.project)) {
      return reply.code(400).send({ error: "invalid project" });
    }
    if (body.lever && !VALID_LEVERS.includes(body.lever)) {
      return reply.code(400).send({ error: "invalid lever" });
    }

    const task = await prisma.task.create({
      data: {
        workspaceId,
        title: body.title.trim(),
        description: body.description,
        project: (body.project as any) ?? "OTHER",
        lever: body.lever as any,
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        checklist: body.checklist ?? undefined,
        createdByAgentKey: body.createdByAgentKey,
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

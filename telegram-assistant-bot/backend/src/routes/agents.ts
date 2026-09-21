import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { AGENTS, getAgent } from "../agents.js";
import { askAgent } from "../claude.js";

/**
 * Общий интерфейс верстака: список агентов + чат с каждым из них.
 * У каждого пользователя — один непрерывный чат на каждого агента (без отдельных
 * тредов/сессий пока — это P0 общего интерфейса).
 */
export async function agentsRoutes(app: FastifyInstance) {
  app.get("/agents", { preHandler: requireAuth }, async () => {
    return AGENTS.map((a) => ({ key: a.key, name: a.name, emoji: a.emoji, tagline: a.tagline }));
  });

  app.get("/agents/:key/messages", { preHandler: requireAuth }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const agent = getAgent(key);
    if (!agent) {
      return reply.code(404).send({ error: "Такого агента нет" });
    }

    const session = request.session!;
    const messages = await prisma.agentMessage.findMany({
      where: { userId: session.userId, agentKey: key },
      orderBy: { createdAt: "asc" },
    });

    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    }));
  });

  app.post("/agents/:key/messages", { preHandler: requireAuth }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const agent = getAgent(key);
    if (!agent) {
      return reply.code(404).send({ error: "Такого агента нет" });
    }

    const body = request.body as { content?: string };
    const content = body?.content?.trim();
    if (!content) {
      return reply.code(400).send({ error: "Пустое сообщение" });
    }

    const session = request.session!;

    const userMessage = await prisma.agentMessage.create({
      data: { userId: session.userId, agentKey: key, role: "user", content },
    });

    const history = await prisma.agentMessage.findMany({
      where: { userId: session.userId, agentKey: key },
      orderBy: { createdAt: "asc" },
      take: 30,
    });

    let replyText: string;
    try {
      replyText = await askAgent(
        agent.systemPrompt,
        history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      );
    } catch (err) {
      app.log.error(err);
      return reply.code(502).send({ error: "ИИ временно недоступен, попробуй ещё раз" });
    }

    const assistantMessage = await prisma.agentMessage.create({
      data: { userId: session.userId, agentKey: key, role: "assistant", content: replyText },
    });

    return reply.send({
      userMessage: {
        id: userMessage.id,
        role: "user",
        content: userMessage.content,
        createdAt: userMessage.createdAt,
      },
      assistantMessage: {
        id: assistantMessage.id,
        role: "assistant",
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt,
      },
    });
  });
}

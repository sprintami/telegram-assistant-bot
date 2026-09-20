import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";

/**
 * GET /me — проверка сессии + базовая информация. Первое, что должен
 * дёрнуть фронтенд Верстака после логина, чтобы узнать, кто он и в каком
 * воркспейсе, и первое, на чём удобно тестировать всю цепочку авторизации.
 */
export async function meRoutes(app: FastifyInstance) {
  app.get("/me", { preHandler: requireAuth }, async (request, reply) => {
    const session = request.session!;

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { workspace: true },
    });

    if (!user) {
      return reply.code(404).send({ error: "Пользователь не найден" });
    }

    return reply.send({
      id: user.id,
      telegramId: Number(user.telegramId),
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      workspace: {
        id: user.workspace.id,
        name: user.workspace.name,
      },
    });
  });
}

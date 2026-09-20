import type { FastifyInstance } from "fastify";
import { prisma } from "../prisma.js";
import { verifyTelegramInitData } from "../telegramAuth.js";
import { issueSessionToken } from "../jwt.js";
import { env } from "../env.js";

/**
 * POST /auth/telegram
 * Body: { initData: string } — сырая строка initData от Telegram.WebApp.initData
 *
 * Логика:
 * 1. Проверяем подпись initData (доказывает, что запрос реально из Telegram).
 * 2. Ищем пользователя по telegramId.
 *    - Если это первый вход владельца (OWNER_TELEGRAM_ID) — создаём воркспейс и юзера-OWNER.
 *    - Если это кто-то ещё, а воркспейса, в который его пригласили, ещё нет —
 *      возвращаем понятную ошибку (в P0 приглашений ещё нет, это будет отдельным шагом).
 * 3. Выдаём сессионный JWT.
 */
export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/telegram", async (request, reply) => {
    const body = request.body as { initData?: string };
    if (!body?.initData) {
      return reply.code(400).send({ error: "initData обязателен" });
    }

    let verified;
    try {
      verified = verifyTelegramInitData(body.initData);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(401).send({ error: message });
    }

    const telegramId = BigInt(verified.user.id);

    let user = await prisma.user.findUnique({ where: { telegramId } });

    if (!user) {
      if (verified.user.id !== env.OWNER_TELEGRAM_ID) {
        // В пилоте пока нет самостоятельной регистрации — воркспейс создаёт
        // только владелец, остальных он добавляет сам (следующий шаг после P0).
        return reply.code(403).send({
          error: "Этот аккаунт пока не привязан ни к одному воркспейсу Верстака",
        });
      }

      const workspace = await prisma.workspace.create({
        data: { name: env.DEFAULT_WORKSPACE_NAME },
      });

      user = await prisma.user.create({
        data: {
          telegramId,
          username: verified.user.username,
          firstName: verified.user.first_name,
          lastName: verified.user.last_name,
          role: "OWNER",
          workspaceId: workspace.id,
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          username: verified.user.username,
          firstName: verified.user.first_name,
          lastName: verified.user.last_name,
          lastSeenAt: new Date(),
        },
      });
    }

    const token = issueSessionToken({
      userId: user.id,
      workspaceId: user.workspaceId,
      telegramId: Number(user.telegramId),
    });

    return reply.send({
      token,
      user: {
        id: user.id,
        telegramId: Number(user.telegramId),
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        workspaceId: user.workspaceId,
      },
    });
  });
}

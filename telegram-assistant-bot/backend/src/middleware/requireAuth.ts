import type { FastifyReply, FastifyRequest } from "fastify";
import { verifySessionToken, type SessionPayload } from "../jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    session?: SessionPayload;
  }
}

/**
 * Достаёт Bearer-токен из Authorization, проверяет подпись и кладёт payload
 * в request.session. Все данные в API дальше фильтруются по session.workspaceId —
 * это и есть изоляция данных между воркспейсами (один клиент не видит чужие).
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    return reply.code(401).send({ error: "Нет токена авторизации" });
  }

  try {
    request.session = verifySessionToken(token);
  } catch {
    return reply.code(401).send({ error: "Токен недействителен или истёк, войдите заново" });
  }
}

import jwt from "jsonwebtoken";
import { env } from "./env.js";

export interface SessionPayload {
  userId: string;
  workspaceId: string;
  telegramId: number;
}

const SESSION_TTL = "30d";

export function issueSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: SESSION_TTL });
}

export function verifySessionToken(token: string): SessionPayload {
  return jwt.verify(token, env.JWT_SECRET) as SessionPayload;
}

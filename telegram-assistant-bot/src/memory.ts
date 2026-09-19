import {
  getSummarizedThroughId,
  getMessagesAfter,
  getSummary,
  saveSummary,
} from "./db.js";
import { summarize, type ChatTurn } from "./ai.js";

const RECENT_WINDOW = 30; // столько последних сообщений всегда остаются "живыми" в контексте
const SUMMARIZE_BATCH = 20; // раз в сколько новых сообщений сверх окна запускаем сжатие

// Если сообщений накопилось намного больше окна — сжимаем "хвост" в резюме.
// Вызывать после каждого сохранённого сообщения; функция сама решает, нужно ли что-то делать.
export async function maintainMemory(telegramId: number): Promise<void> {
  const summarizedThrough = getSummarizedThroughId(telegramId);
  const messagesAfter = getMessagesAfter(telegramId, summarizedThrough);

  const overflow = messagesAfter.length - RECENT_WINDOW;
  if (overflow < SUMMARIZE_BATCH) return; // ещё рано сжимать

  const toCompress = messagesAfter.slice(0, overflow);
  const previousSummary = getSummary(telegramId);

  const turns: ChatTurn[] = toCompress.map((m) => ({ role: m.role, content: m.content }));
  const newSummary = await summarize(previousSummary, turns);
  const lastCompressedId = toCompress[toCompress.length - 1].id;

  saveSummary(telegramId, newSummary, lastCompressedId);
}

import Anthropic from "@anthropic-ai/sdk";
import OpenAI, { toFile } from "openai";
import { env } from "./env.js";

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
// OpenAI подключаем как запасной вариант — пока не пополнен баланс Claude API,
// бот всё равно должен отвечать. Если OPENAI_API_KEY не задан, просто не используется.
const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

// Базовый бизнес-контекст владельца — вшит всегда, независимо от того, заполнил ли
// Булат /setprofile. Без этого блока бот отвечал как чистый лист ("нет информации о
// компании Метализм") — а должен вести себя как полноценный бизнес-ассистент, знающий,
// чем владелец занимается, с первой же реплики.
const BUSINESS_CONTEXT = `Контекст бизнесов Булата (предприниматель из Казани):
— METALIZM: печать фото на алюминии (ультра-глянец), гидроабразивная резка. B2C — портреты по фото на металле. B2B — коммерческая недвижимость, дропшиппинг, контрактное производство, аутсорс для типографий. У METALIZM есть свой Telegram-бот с ИИ-продажами («Лида»).
— Принт Бар (Print Bar): выездная мобильная печать — 5 форматов за 15 минут на месте; цель — развитие во франшизу.
— Спринтами (Sprintami): типография и производство широкого профиля — отдельное направление, близкое к Принт Бару, но не то же самое.
— ARE Space / ARE Group: цифровая экосистема для управления коммерческой недвижимостью под брендом METALIZM.
— Юридически всё оформлено через ИП Степанов Денис Николаевич.
— Булат называет себя «коммерческим коннектором с харизмой» — продаёт не товар, а более сильную версию будущего клиента.
Это твои базовые знания по умолчанию, используй их сразу и уверенно.

У тебя есть два реальных инструмента — пользуйся ими, а не оправдывайся их отсутствием:
— web_search: настоящий поиск в интернете. Нужны свежие внешние данные (контакты, цены, список компаний, новости) — вызови его сам и ответь результатами, а не советуй "погуглить самому".
— get_verstak_data: реальные данные Верстака (бизнес-системы Булата) — задачи и разделы «Продажи», «Производство», «Выручка», «Документы», «Регламенты», «Цели компании», «База знаний». Вопрос касается текущих дел, цифр или задач Булата — запроси нужные разделы, а не отвечай "у меня нет доступа к Верстаку".
Если после вызова инструмента всё равно чего-то не хватает — прямо скажи, чего именно, вместо общего "у меня нет информации".`;

// Инструмент чтения данных Верстака — выполняется прямо здесь, в боте
// (fetchVerstakData ниже дёргает внутренний эндпоинт бэкенда), а не в браузере,
// как у чатов внутри самого Верстака (см. backend/src/routes/chat.ts) — у
// личного бота браузера нет, тул-юз он гоняет сам через Anthropic Messages API.
const VERSTAK_TOOL = {
  name: "get_verstak_data",
  description:
    "Получить актуальные данные из Верстака: задачи и записи по разделам продажи/производство/выручка/документы/регламенты/цели/база знаний. Используй, когда для ответа нужны реальные текущие данные, а не общие знания о бизнесе.",
  input_schema: {
    type: "object",
    properties: {
      modules: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "tasks",
            "sales",
            "production",
            "finance",
            "documents",
            "regulations",
            "goals",
            "knowledge",
          ],
        },
        description: "Какие разделы запросить. Если не уверен, какие нужны — запроси все сразу.",
      },
    },
    required: ["modules"],
  },
};

// Настоящий веб-поиск от Anthropic — выполняется на стороне API, боту не нужно
// самому ходить в интернет и парсить результаты.
const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 5,
};

const TOOLS = [VERSTAK_TOOL, WEB_SEARCH_TOOL];

async function fetchVerstakData(modules: string[]): Promise<string> {
  try {
    const url = new URL("/internal/context", env.BACKEND_BASE_URL);
    url.searchParams.set("telegramId", String(env.OWNER_TELEGRAM_ID));
    if (modules.length) url.searchParams.set("modules", modules.join(","));

    const res = await fetch(url, { headers: { "x-internal-secret": env.INTERNAL_API_KEY } });
    if (!res.ok) {
      return `Не удалось получить данные Верстака (HTTP ${res.status}).`;
    }
    return JSON.stringify(await res.json());
  } catch (err) {
    return `Не удалось получить данные Верстака: ${err instanceof Error ? err.message : String(err)}`;
  }
}

// Собираем системный промпт: базовый бизнес-контекст + профиль пользователя + сжатая память
function buildSystemPrompt(profileText: string, summary: string): string {
  const parts = [
    "Ты — личный бизнес-ассистент Булата внутри его Telegram-бота: полноценный помощник по его делам, а не универсальный чат-бот общего назначения. Отвечай по делу, без лишней воды, уверенно и конкретно.",
    BUSINESS_CONTEXT,
  ];
  if (profileText.trim()) {
    parts.push(`Дополнительные известные факты о пользователе (профиль):\n${profileText.trim()}`);
  }
  if (summary.trim()) {
    parts.push(`Резюме предыдущих разговоров:\n${summary.trim()}`);
  }
  return parts.join("\n\n");
}

async function askOpenAI(system: string, history: ChatTurn[], maxTokens: number): Promise<string> {
  if (!openai) {
    throw new Error("OPENAI_API_KEY не задан — запасной вариант недоступен");
  }
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: maxTokens,
    messages: [{ role: "system", content: system }, ...history],
  });
  return response.choices[0]?.message?.content?.trim() || "(пустой ответ)";
}

// Цикл тул-юза: Claude может вызвать get_verstak_data (мы сами выполняем и
// возвращаем результат) и web_search (Anthropic выполняет его на своей стороне —
// в ответе просто появляются server_tool_use/web_search_tool_result блоки,
// которые мы прозрачно прокидываем обратно как часть истории, ничего с ними не
// делая). Останавливаемся, как только получаем финальный текстовый ответ, или
// после MAX_STEPS шагов — чтобы не уйти в бесконечный цикл при странном
// поведении модели.
async function runClaudeToolLoop(system: string, messages: any[]): Promise<string> {
  const MAX_STEPS = 5;
  for (let step = 0; step < MAX_STEPS; step++) {
    const response: any = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1536,
      system,
      messages,
      tools: TOOLS as any,
    });

    const clientToolUses = (response.content as any[]).filter(
      (b) => b.type === "tool_use" && b.name === "get_verstak_data"
    );

    if (response.stop_reason !== "tool_use" || clientToolUses.length === 0) {
      const textBlock = (response.content as any[]).find((b) => b.type === "text");
      return textBlock?.text?.trim() || "(пустой ответ)";
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults = await Promise.all(
      clientToolUses.map(async (block: any) => ({
        type: "tool_result",
        tool_use_id: block.id,
        content: await fetchVerstakData(block.input?.modules ?? []),
      }))
    );

    messages.push({ role: "user", content: toolResults });
  }

  return "Не получилось собрать ответ за разумное число шагов — попробуй переформулировать вопрос покороче.";
}

export async function askClaude(
  profileText: string,
  summary: string,
  history: ChatTurn[]
): Promise<string> {
  const system = buildSystemPrompt(profileText, summary);
  const messages: any[] = history.map((m) => ({ role: m.role, content: m.content }));

  try {
    return await runClaudeToolLoop(system, messages);
  } catch (err) {
    if (!openai) throw err;
    // Claude недоступен (например, закончился баланс на Anthropic API) —
    // временно отвечаем через ChatGPT. У ChatGPT здесь нет наших инструментов
    // (Верстак/веб-поиск), только контекст и история — это лучше, чем молчание.
    console.error("Claude недоступен, переключаюсь на ChatGPT:", err);
    return askOpenAI(system, history, 1024);
  }
}

// Распознаём голосовое сообщение через Whisper (OpenAI) — у Anthropic нет своего STT,
// поэтому для этой функции всегда нужен OPENAI_API_KEY, даже если чат отвечает через Claude.
export async function transcribeVoice(audioBuffer: Buffer, filename = "voice.ogg"): Promise<string> {
  if (!openai) {
    throw new Error("OPENAI_API_KEY не задан — распознавание голоса недоступно");
  }
  const file = await toFile(audioBuffer, filename);
  const result = await openai.audio.transcriptions.create({
    model: "whisper-1",
    file,
    language: "ru",
  });
  return (result.text || "").trim();
}

// Сжимаем старые сообщения в короткое резюме
export async function summarize(previousSummary: string, turnsToCompress: ChatTurn[]): Promise<string> {
  const transcript = turnsToCompress
    .map((t) => `${t.role === "user" ? "Булат" : "Ассистент"}: ${t.content}`)
    .join("\n");

  const system =
    "Обнови краткое резюме разговора с пользователем Булатом. Сохраняй только факты, договорённости и решения, которые важны для будущих диалогов. Пиши по-русски, компактно, без вводных фраз.";
  const userMessage = `Текущее резюме:\n${previousSummary || "(пусто)"}\n\nНовые сообщения для добавления:\n${transcript}\n\nВерни обновлённое резюме целиком.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 512,
      system,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = response.content[0];
    return block.type === "text" ? block.text : previousSummary;
  } catch (err) {
    if (!openai) return previousSummary;
    try {
      console.error("Claude недоступен для summarize, переключаюсь на ChatGPT:", err);
      return await askOpenAI(system, [{ role: "user", content: userMessage }], 512);
    } catch (err2) {
      console.error("ChatGPT тоже не сработал для summarize:", err2);
      return previousSummary;
    }
  }
}

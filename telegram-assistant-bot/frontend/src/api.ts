const API_URL = import.meta.env.VITE_API_URL as string | undefined;

export interface MeResponse {
  id: string;
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  role: "OWNER" | "MEMBER";
  workspace: {
    id: string;
    name: string;
  };
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function baseUrl(): string {
  if (!API_URL) {
    throw new Error(
      "VITE_API_URL не задан. Добавь переменную окружения на Vercel со ссылкой на бэкенд Верстака.",
    );
  }
  return API_URL.replace(/\/$/, "");
}

export async function loginWithTelegram(
  initData: string,
): Promise<{ token: string; user: MeResponse }> {
  const res = await fetch(`${baseUrl()}/auth/telegram`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? "Не удалось войти");
  }

  return data as { token: string; user: MeResponse };
}

export async function fetchMe(token: string): Promise<MeResponse> {
  const res = await fetch(`${baseUrl()}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? "Не удалось получить профиль");
  }

  return data as MeResponse;
}

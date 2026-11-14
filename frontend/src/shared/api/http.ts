
import { ApiError } from "./errors";

export async function request<T>(method: string, url: string, body?: object): Promise<T> {
  const options: RequestInit = { method };
  if (body instanceof FormData) {
    options.body = body;
  } else if (body !== undefined) {
    options.body = JSON.stringify(body);
    options.headers = { "Content-Type": "application/json" };
  }

  const startedAt = Date.now();
  const response = await fetch("/api" + url, options);

  if (import.meta.env.DEV) {
    const address = url.split("?")[0];
    console.log(`[запрос] ${method} /api${address} → ${response.status}, ${Date.now() - startedAt} мс`);
  }

  if (response.status === 401 && !location.pathname.endsWith("/login.html")) {
    location.href = "/pages/login.html";
    return new Promise<T>(() => {});
  }
  if (!response.ok) {
    throw new ApiError(response.status, await readErrorText(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}

async function readErrorText(response: Response): Promise<string> {
  const defaultText = "Не удалось выполнить действие. Попробуйте ещё раз";
  try {
    const data = await response.json();
    return data.error ?? defaultText;
  } catch {
    return defaultText;
  }
}

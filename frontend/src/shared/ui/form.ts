
import { ApiError } from "@shared/api/errors";
import { h } from "./dom";

export function createInput(attrs: Record<string, string>): HTMLInputElement {
  return h("input", attrs) as HTMLInputElement;
}

export function field(label: string, input: HTMLElement, hint?: string, note?: string): HTMLElement {
  return h("label", { class: "field" },
    h("span", {}, label, note ? h("small", {}, ` · ${note}`) : null),
    input,
    hint ? h("div", { class: "hint" }, hint) : null,
  );
}

export function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз";
}

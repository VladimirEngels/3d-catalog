
import { h } from "./dom";

export function buildPager(page: number, pageSize: number, total: number, shown: number, onChange: (page: number) => void): HTMLElement {
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = page * pageSize + shown;

  const previous = h("button", { class: "btn small", type: "button" }, "← Назад") as HTMLButtonElement;
  previous.disabled = page === 0;
  previous.addEventListener("click", () => onChange(page - 1));

  const next = h("button", { class: "btn small", type: "button" }, "Дальше →") as HTMLButtonElement;
  next.disabled = last >= total;
  next.addEventListener("click", () => onChange(page + 1));

  return h("div", { class: "pager" },
    h("span", {}, `Показано ${first}–${last} из ${total}`),
    h("span", { class: "pager-buttons" }, previous, next),
  );
}

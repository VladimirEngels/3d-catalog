
import { h } from "@shared/ui/dom";

export function buildStat(label: string, value: string, note: string): HTMLElement {
  return h("div", { class: "stat" },
    h("div", { class: "label" }, label),
    h("div", { class: "value" }, value),
    h("div", { class: "delta" }, note),
  );
}

export function buildChartPanel(title: string, subtitle: string, content: HTMLElement): HTMLElement {
  return h("div", { class: "panel" },
    h("h3", { class: "chart-title" }, title),
    h("div", { class: "chart-sub" }, subtitle),
    content,
  );
}

export function buildPeriodSelect(value: string, onChange: (value: string) => void): HTMLSelectElement {
  const select = h("select", { class: "period-select", "aria-label": "Период" },
    h("option", { value: "14" }, "Последние 14 дней"),
    h("option", { value: "30" }, "Последние 30 дней"),
    h("option", { value: "90" }, "Последние 90 дней"),
  ) as HTMLSelectElement;
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

export function percent(part: number, whole: number): string {
  return whole === 0 ? "0 %" : `${Math.round((part / whole) * 100)} %`;
}


import { h } from "@shared/ui/dom";
import type { CatalogFilters, CatalogResponse, ModelFormat } from "../api";

export const FORMATS: { value: ModelFormat; label: string }[] = [
  { value: "GLB", label: "GLB" },
  { value: "GLTF", label: "glTF" },
  { value: "OBJ", label: "OBJ" },
  { value: "PLY", label: "PLY" },
  { value: "STL", label: "STL" },
];

export const QUALITY_LABELS = { good: "80 % и выше", review: "Требует проверки" };
export const PERIOD_LABELS: Record<string, string> = { "7": "За неделю", "30": "За месяц" };

function buildCheck(label: string, count: number, checked: boolean, onChange: (checked: boolean) => void): HTMLElement {
  const input = h("input", { type: "checkbox" }) as HTMLInputElement;
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  return h("label", { class: "check" }, input, label, h("span", { class: "num" }, String(count)));
}

function buildSelect(options: [string, string][], value: string, onChange: (value: string) => void): HTMLElement {
  const select = h("select") as HTMLSelectElement;
  for (const [optionValue, label] of options) {
    select.append(h("option", { value: optionValue }, label));
  }
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

function buildNumberInput(placeholder: string, value: string, onChange: (value: string) => void): HTMLElement {
  const input = h("input", { type: "number", min: "0", step: "1", placeholder }) as HTMLInputElement;
  input.value = value;
  input.addEventListener("change", () => onChange(input.value));
  return input;
}

export function buildFilters(
  filters: CatalogFilters,
  data: CatalogResponse,
  onChange: () => void,
  onReset: () => void,
): HTMLElement {
  const formatChecks = FORMATS.map(({ value, label }) =>
    buildCheck(label, data.facets.formats[value] ?? 0, filters.formats.includes(value), (checked) => {
      filters.formats = checked ? [...filters.formats, value] : filters.formats.filter((format) => format !== value);
      onChange();
    }),
  );

  const authors: [string, string][] = [["", "Все участники"], ...data.facets.authors.map((author): [string, string] => [String(author.id), author.name])];

  const resetButton = h("button", { class: "btn link", type: "button" }, "Сбросить");
  resetButton.addEventListener("click", onReset);

  return h("aside", { class: "filters" },
    h("div", { class: "filters-head" }, h("h2", {}, "Фильтры"), resetButton),

    h("div", { class: "filter-group" }, h("h3", {}, "Формат"), ...formatChecks),

    h("div", { class: "filter-group" },
      h("h3", {}, "Состав модели"),
      buildCheck("Есть скелет", data.facets.withSkeleton, filters.skeleton, (checked) => { filters.skeleton = checked; onChange(); }),
      buildCheck("Есть текстуры", data.facets.withTextures, filters.textures, (checked) => { filters.textures = checked; onChange(); }),
    ),

    h("div", { class: "filter-group" },
      h("h3", {}, "Треугольников"),
      h("div", { class: "range" },
        buildNumberInput("от", filters.minTriangles, (value) => { filters.minTriangles = value; onChange(); }),
        h("span", {}, "—"),
        buildNumberInput("до", filters.maxTriangles, (value) => { filters.maxTriangles = value; onChange(); }),
      ),
    ),

    h("div", { class: "filter-group" },
      h("h3", {}, "Оценка качества"),
      buildSelect([["", "Любая"], ["good", QUALITY_LABELS.good], ["review", QUALITY_LABELS.review]], filters.quality, (value) => {
        filters.quality = value as CatalogFilters["quality"];
        onChange();
      }),
    ),

    h("div", { class: "filter-group" },
      h("h3", {}, "Автор"),
      buildSelect(authors, filters.author, (value) => { filters.author = value; onChange(); }),
    ),

    h("div", { class: "filter-group" },
      h("h3", {}, "Дата добавления"),
      buildSelect([["", "За всё время"], ["7", PERIOD_LABELS["7"]], ["30", PERIOD_LABELS["30"]]], filters.days, (value) => {
        filters.days = value;
        onChange();
      }),
    ),
  );
}

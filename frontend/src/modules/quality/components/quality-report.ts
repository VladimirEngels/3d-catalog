import { h } from "@shared/ui/dom";
import { errorText } from "@shared/ui/form";
import { formatDate } from "@shared/ui/format";
import { getQualityReports, type QualityReport, type GeometrySummary } from "../api";
import "../quality.css";

const GOOD_SCORE = 80;
const BAD_SCORE = 50;

function buildIssue(level: "ok" | "warn" | "err", mark: string, text: string): HTMLElement {
  return h("li", { class: level }, h("span", { class: "mark" }, mark), h("div", {}, text));
}

function buildPanels(report: QualityReport): HTMLElement {
  let level = "err";
  if (report.similarity !== null && report.similarity >= GOOD_SCORE) {
    level = "ok";
  } else if (report.similarity !== null && report.similarity >= BAD_SCORE) {
    level = "warn";
  }

  const scorePanel =
    report.method === "structure" && report.before && report.after
      ? buildMetrics(report.before, report.after, report.needsReview)
      : h(
          "div",
          { class: "panel" },
          h("h3", {}, "Оценка похожести"),
          h("div", { class: "note warn" }, "Демонстрационный отчёт: оценка подготовлена заранее."),
          h(
            "div",
            { class: `big-score ${level}` },
            report.similarity === null ? "—" : `${Math.round(report.similarity)} %`,
          ),
          report.needsReview ? h("div", { class: "note warn" }, "Нужна проверка человеком") : null,
        );

  const losses = h("ul", { class: "issues" });
  for (const message of report.losses) {
    losses.append(buildIssue("err", "✕", message));
  }
  if (report.losses.length === 0) {
    losses.append(buildIssue("ok", "✓", "Известные потери не обнаружены"));
  }

  const defects = h("ul", { class: "issues" });
  for (const message of report.defects) {
    defects.append(buildIssue("warn", "!", message));
  }
  if (report.defects.length === 0) {
    defects.append(buildIssue("ok", "✓", "Проверенные показатели не выявили расхождений"));
  }

  return h(
    "div",
    { class: "qc" },
    scorePanel,
    h("div", { class: "panel" }, h("h3", {}, "Что не сохранилось"), losses),
    h("div", { class: "panel" }, h("h3", {}, "Ошибки в модели"), defects),
  );
}

function buildMetrics(
  before: GeometrySummary,
  after: GeometrySummary,
  needsReview: boolean,
): HTMLElement {
  const yesNo = (value: boolean) => (value ? "Есть" : "Нет");
  const size = (value: number[]) =>
    value.map((number) => Number(number.toPrecision(6))).join(" × ");
  const rows = [
    ["Вершины", String(before.vertices), String(after.vertices)],
    ["Треугольники", String(before.triangles), String(after.triangles)],
    ["Сетки", String(before.meshes), String(after.meshes)],
    ["Размеры X × Y × Z", size(before.size), size(after.size)],
    ["UV-координаты", yesNo(before.hasUv), yesNo(after.hasUv)],
    ["Базовая текстура", yesNo(before.hasTextures), yesNo(after.hasTextures)],
    ["Скелет", yesNo(before.hasSkeleton), yesNo(after.hasSkeleton)],
  ];
  return h(
    "div",
    { class: "panel" },
    h("h3", {}, "Структурная проверка"),
    h(
      "div",
      { class: needsReview ? "note warn" : "note" },
      needsReview
        ? "Есть потери или расхождения — проверьте результат"
        : "Проверенные показатели сохранены",
    ),
    h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        { class: "table" },
        h(
          "thead",
          {},
          h(
            "tr",
            {},
            ...["Показатель", "Исходная модель", "Результат"].map((title) => h("th", {}, title)),
          ),
        ),
        h(
          "tbody",
          {},
          ...rows.map((row) => h("tr", {}, ...row.map((value) => h("td", {}, value)))),
        ),
      ),
    ),
    h(
      "p",
      { class: "muted" },
      "Результат повторно прочитан после записи. Размеры указаны в единицах модели. Количество вершин и сеток может меняться при объединении и разделении геометрии.",
    ),
    h(
      "p",
      { class: "muted" },
      "Проверка не сравнивает изображения, форму каждой поверхности и внешний вид материалов. Процент визуальной похожести не рассчитан.",
    ),
  );
}

export async function showQualityReport(
  container: HTMLElement,
  teamId: number,
  modelId: number,
): Promise<void> {
  let reports: QualityReport[];
  try {
    reports = await getQualityReports(teamId, modelId);
  } catch (error) {
    container.replaceChildren(
      h("div", { class: "empty-box" }, h("b", {}, "Не удалось загрузить отчёт"), errorText(error)),
    );
    return;
  }

  if (reports.length === 0) {
    container.replaceChildren(
      h(
        "div",
        { class: "empty-box" },
        h("b", {}, "Результатов пока нет"),
        "После смены формата модели здесь появится отчёт о качестве.",
      ),
    );
    return;
  }

  const panels = h("div", {});
  const select = h("select") as HTMLSelectElement;
  reports.forEach((report, index) => {
    const date = report.finishedAt ? ` · ${formatDate(report.finishedAt)}` : "";
    select.append(
      h(
        "option",
        { value: String(index) },
        `${report.sourceFormat} → ${report.targetFormat}${date}`,
      ),
    );
  });
  select.addEventListener("change", () =>
    panels.replaceChildren(buildPanels(reports[Number(select.value)])),
  );
  panels.append(buildPanels(reports[0]));

  container.replaceChildren(
    h("div", { class: "qc-toolbar" }, h("span", {}, "Результат:"), select),
    panels,
  );
}

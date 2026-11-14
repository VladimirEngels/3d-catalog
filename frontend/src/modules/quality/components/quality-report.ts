
import { h } from "@shared/ui/dom";
import { errorText } from "@shared/ui/form";
import { formatDate } from "@shared/ui/format";
import { getQualityReports, type QualityReport } from "../api";
import "../quality.css";

const GOOD_SCORE = 80;
const BAD_SCORE = 50;

function buildIssue(level: "ok" | "warn" | "err", mark: string, text: string): HTMLElement {
  return h("li", { class: level }, h("span", { class: "mark" }, mark), h("div", {}, text));
}

function buildPanels(report: QualityReport): HTMLElement {
  let level = "err";
  if (report.similarity >= GOOD_SCORE) {
    level = "ok";
  } else if (report.similarity >= BAD_SCORE) {
    level = "warn";
  }

  const scorePanel = h("div", { class: "panel" },
    h("h3", {}, "Оценка похожести"),
    h("div", { class: `big-score ${level}` }, `${Math.round(report.similarity)} %`),
    report.needsReview ? h("div", { class: "note warn" }, `Ниже порога ${GOOD_SCORE} % — нужна проверка человеком`) : null,
  );

  const losses = h("ul", { class: "issues" });
  for (const message of report.losses) {
    losses.append(buildIssue("err", "✕", message));
  }
  if (report.losses.length === 0) {
    losses.append(buildIssue("ok", "✓", "Все данные сохранены"));
  }

  const defects = h("ul", { class: "issues" });
  for (const message of report.defects) {
    defects.append(buildIssue("warn", "!", message));
  }
  if (report.defects.length === 0) {
    defects.append(buildIssue("ok", "✓", "Ошибок не найдено"));
  }

  return h("div", { class: "qc" },
    scorePanel,
    h("div", { class: "panel" }, h("h3", {}, "Что не сохранилось"), losses),
    h("div", { class: "panel" }, h("h3", {}, "Ошибки в модели"), defects),
  );
}

export async function showQualityReport(container: HTMLElement, teamId: number, modelId: number): Promise<void> {
  let reports: QualityReport[];
  try {
    reports = await getQualityReports(teamId, modelId);
  } catch (error) {
    container.replaceChildren(h("div", { class: "empty-box" }, h("b", {}, "Не удалось загрузить отчёт"), errorText(error)));
    return;
  }

  if (reports.length === 0) {
    container.replaceChildren(h("div", { class: "empty-box" }, h("b", {}, "Переводов пока не было"), "Когда модель переведут в другой формат, здесь появится отчёт о качестве."));
    return;
  }

  const panels = h("div", {});
  const select = h("select") as HTMLSelectElement;
  reports.forEach((report, index) => {
    const date = report.finishedAt ? ` · ${formatDate(report.finishedAt)}` : "";
    select.append(h("option", { value: String(index) }, `${report.sourceFormat} → ${report.targetFormat}${date}`));
  });
  select.addEventListener("change", () => panels.replaceChildren(buildPanels(reports[Number(select.value)])));
  panels.append(buildPanels(reports[0]));

  container.replaceChildren(
    h("div", { class: "demo-note" }, "Проверка качества пока не подключена: это заготовленный пример отчёта."),
    h("div", { class: "qc-toolbar" }, h("span", {}, "Перевод:"), select),
    panels,
  );
}

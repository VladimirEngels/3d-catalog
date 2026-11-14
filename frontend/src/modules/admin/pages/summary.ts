import { can, getSession } from "@shared/session";
import { drawBars, drawColumns } from "@shared/ui/charts";
import { h } from "@shared/ui/dom";
import { errorText } from "@shared/ui/form";
import { formatBytes, formatNumber } from "@shared/ui/format";
import { mountLayout, pageHead } from "@shared/ui/layout";
import { getTeamSummary, type TeamSummary } from "../api";
import { buildChartPanel, buildPeriodSelect, buildStat, percent } from "../components/report-parts";

const main = await mountLayout("summary");
const session = await getSession();

if (!can(session, "viewLog")) {
  location.href = "/pages/catalog.html";
  await new Promise(() => {});
}

const team = session.team!;
const content = h("div", {});

async function load(days: string): Promise<void> {
  content.classList.add("is-loading");
  try {
    render(await getTeamSummary(team.teamId, days), days);
  } catch (error) {
    content.replaceChildren(h("div", { class: "empty-box" }, h("b", {}, "Не удалось загрузить сводку"), errorText(error)));
  }
  content.classList.remove("is-loading");
}

function render(data: TeamSummary, days: string): void {
  const empty = (text: string) => h("div", { class: "panel-empty" }, text);

  const byDay = h("div", { class: "chart" });
  const errors = h("div", { class: "chart" });
  const formats = h("div", { class: "chart" });
  const noJobs = data.jobs === 0;

  const body = h("tbody");
  for (const model of data.largestModels) {
    body.append(h("tr", {},
      h("td", {}, h("a", { href: `/pages/model.html?id=${model.id}` }, model.name)),
      h("td", {}, model.authorName),
      h("td", {}, formatNumber(model.triangles)),
      h("td", {}, formatBytes(model.sizeBytes)),
    ));
  }
  const head = ["Модель", "Автор", "Треугольников", "Размер"];
  const largest = data.largestModels.length === 0
    ? empty("В каталоге пока нет моделей")
    : h("div", { class: "table-wrap" }, h("table", { class: "table" }, h("thead", {}, h("tr", {}, ...head.map((title) => h("th", {}, title)))), body));

  const perDay = Math.round(data.jobs / Number(days));
  content.replaceChildren(
    h("div", { class: "stats" },
      buildStat("Моделей", formatNumber(data.models), `+${data.newModels} за период`),
      buildStat("Участников", formatNumber(data.members), `+${data.newMembers} за период`),
      buildStat("Переводов", formatNumber(data.jobs), `в среднем ${perDay} в день`),
      buildStat("Ошибок перевода", formatNumber(data.failedJobs), `${percent(data.failedJobs, data.jobs)} от переводов`),
    ),
    buildChartPanel("Переводы по дням", "Сколько переводов запустили участники за день", noJobs ? empty("За этот период переводов не было") : byDay),
    h("div", { class: "cols-even report-row" },
      buildChartPanel("Причины ошибок", "Почему перевод не удался", data.errorReasons.length === 0 ? empty("За этот период ошибок не было") : errors),
      buildChartPanel("Популярные форматы", "В какой формат переводили чаще всего", noJobs ? empty("За этот период переводов не было") : formats),
    ),
    buildChartPanel("Самые большие модели", "По размеру файлов текущей версии", largest),
  );

  if (!noJobs) {
    drawColumns(byDay, data.jobsByDay.map((item) => item.day), data.jobsByDay.map((item) => item.count), "переводов");
    drawBars(formats, data.formats.map((item) => item.format), data.formats.map((item) => item.count), "переводов");
  }
  if (data.errorReasons.length > 0) {
    drawBars(errors, data.errorReasons.map((item) => item.reason), data.errorReasons.map((item) => item.count), "ошибок");
  }
}

main.append(
  pageHead("Сводка", `команда «${team.teamName}»`, [buildPeriodSelect("14", load)]),
  content,
);
await load("14");

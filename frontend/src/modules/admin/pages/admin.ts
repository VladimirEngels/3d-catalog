import { getSession } from "@shared/session";
import { drawColumns } from "@shared/ui/charts";
import { h } from "@shared/ui/dom";
import { errorText } from "@shared/ui/form";
import { formatBytes, formatNumber } from "@shared/ui/format";
import { mountLayout, pageHead } from "@shared/ui/layout";
import { getSystemStats, type SystemStats } from "../api";
import { buildChartPanel, buildPeriodSelect, buildStat, percent } from "../components/report-parts";

const main = await mountLayout("admin", "admin");
const session = await getSession();

if (!session.user.isAdmin) {
  location.href = "/pages/catalog.html";
  await new Promise(() => {});
}

const content = h("div", {});

function render(data: SystemStats): void {
  const chart = h("div", { class: "chart" });
  const noJobs = data.jobs === 0;

  content.replaceChildren(
    h("div", { class: "stats five" },
      buildStat("Пользователей", formatNumber(data.users), `+${data.newUsers} за период`),
      buildStat("Команд", formatNumber(data.teams), `+${data.newTeams} за период`),
      buildStat("Занято на диске", formatBytes(data.diskBytes), "файлы и текстуры"),
      buildStat("Переводов", formatNumber(data.jobs), "за период"),
      buildStat("Ошибок перевода", formatNumber(data.failedJobs), `${percent(data.failedJobs, data.jobs)} от переводов`),
    ),
    buildChartPanel(
      "Переводы по дням",
      "Все команды вместе",
      noJobs ? h("div", { class: "panel-empty" }, "За этот период переводов не было") : chart,
    ),
  );

  if (!noJobs) {
    drawColumns(chart, data.jobsByDay.map((item) => item.day), data.jobsByDay.map((item) => item.count), "переводов");
  }
}

async function load(days: string): Promise<void> {
  try {
    render(await getSystemStats(days));
  } catch (error) {
    content.replaceChildren(h("div", { class: "empty-box" }, h("b", {}, "Не удалось загрузить статистику"), errorText(error)));
  }
}

main.append(pageHead("Статистика системы", undefined, [buildPeriodSelect("14", load)]), content);
await load("14");

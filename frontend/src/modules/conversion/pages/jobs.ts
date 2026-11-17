import { can, getSession } from "@shared/session";
import { confirmAction, showMessage } from "@shared/ui/dialog";
import { h } from "@shared/ui/dom";
import { errorText } from "@shared/ui/form";
import { formatMoment } from "@shared/ui/format";
import { icon } from "@shared/ui/icons";
import { mountLayout, pageHead } from "@shared/ui/layout";
import { buildPager } from "@shared/ui/pager";
import { cancelJob, getJobs, type Job, type JobsResponse } from "../api";
import "../conversion.css";

const main = await mountLayout("jobs");
const session = await getSession();

if (!can(session, "convert")) {
  location.href = "/pages/catalog.html";
  await new Promise(() => {});
}

const teamId = session.team!.teamId;
const GOOD_SCORE = 80;
const BAD_SCORE = 50;

const STATUS_NAMES: Record<Job["status"], string> = {
  queued: "В очереди",
  running: "Выполняется",
  done: "Готово",
  failed: "Ошибка",
};

let tab = "";
let page = 0;
const tabBar = h("div", { class: "tabs" });
const content = h("div", {});

function buildStatus(job: Job): HTMLElement {
  const cell = h("td", {}, h("span", { class: `status ${job.status}` }, STATUS_NAMES[job.status]));
  if (job.status === "running") {
    cell.append(h("div", { class: "progress running-bar" }, h("div")));
  } else if (job.status === "queued") {
    const text =
      job.jobsBefore === 0 ? "Следующая в очереди" : `Впереди в очереди: ${job.jobsBefore}`;
    cell.append(h("div", { class: "muted job-note" }, text));
  } else if (job.status === "failed" && job.error) {
    cell.append(h("div", { class: "err-text" }, job.error));
  }
  for (const warning of job.warnings ?? [])
    cell.append(h("div", { class: "muted job-note" }, warning));
  return cell;
}

function buildQuality(job: Job): HTMLElement {
  if (job.quality === null) {
    return h("td", { class: "muted" }, "—");
  }
  let level = "err";
  if (job.quality >= GOOD_SCORE) {
    level = "ok";
  } else if (job.quality >= BAD_SCORE) {
    level = "warn";
  }
  const text = job.needsReview
    ? `${Math.round(job.quality)} % · проверить`
    : `${Math.round(job.quality)} %`;
  return h("td", {}, h("span", { class: `score ${level}` }, text));
}

function buildAction(job: Job): HTMLElement | null {
  const modelPage = `/pages/model.html?id=${job.modelId}`;

  if (job.status === "queued") {
    const button = h("button", { class: "btn small", type: "button" }, "Отменить");
    button.addEventListener("click", async () => {
      const agreed = await confirmAction(
        "Отменить обработку?",
        `Модель «${job.modelName}» останется в исходном формате.`,
        "Отменить",
      );
      if (!agreed) {
        return;
      }
      try {
        await cancelJob(teamId, job.id);
        await load();
      } catch (error) {
        showMessage("Не удалось отменить обработку", errorText(error));
      }
    });
    return button;
  }
  if (job.status === "failed") {
    return h("a", { class: "btn small", href: modelPage }, "Открыть модель");
  }
  if (job.status === "done" && job.quality !== null && job.resultFileId === null) {
    return h("a", { class: "btn small", href: `${modelPage}#quality` }, "Отчёт");
  }
  if (job.status === "done" && job.resultFileId !== null) {
    return h(
      "div",
      {},
      h("a", { class: "btn small", href: `${modelPage}#quality` }, "Отчёт"),
      h(
        "a",
        {
          class: "btn small",
          href: `/api/teams/${teamId}/models/${job.modelId}/files/${job.resultFileId}/download`,
        },
        "Скачать",
      ),
    );
  }
  return null;
}

function buildRow(job: Job): HTMLElement {
  const preview = job.hasPreview
    ? h("img", {
        src: `/api/teams/${teamId}/models/${job.modelId}/preview`,
        alt: "",
        loading: "lazy",
      })
    : icon("box");

  return h(
    "tr",
    {},
    h(
      "td",
      {},
      h(
        "div",
        { class: "model-cell" },
        h("div", { class: "preview" }, preview),
        h("a", { href: `/pages/model.html?id=${job.modelId}` }, job.modelName),
      ),
    ),
    h(
      "td",
      {},
      `${job.sourceFormat} → ${job.targetFormat}`,
      job.upscaleTextures ? h("div", { class: "muted job-note" }, "+ улучшение текстур") : null,
    ),
    buildStatus(job),
    buildQuality(job),
    h("td", { class: "muted" }, formatMoment(job.createdAt)),
    h("td", {}, buildAction(job)),
  );
}

function renderTabs(data: JobsResponse): void {
  const tabs: [string, string, number][] = [
    ["", "Все", data.counts.all],
    ["active", "Выполняются", data.counts.active],
    ["done", "Готово", data.counts.done],
    ["failed", "Ошибки", data.counts.failed],
  ];
  tabBar.replaceChildren(
    ...tabs.map(([id, label, count]) => {
      const link = h(
        "a",
        { href: "#", class: id === tab ? "active" : "tab" },
        label,
        h("span", { class: "count" }, String(count)),
      );
      link.addEventListener("click", (event) => {
        event.preventDefault();
        tab = id;
        page = 0;
        load();
      });
      return link;
    }),
  );
}

function render(data: JobsResponse): void {
  renderTabs(data);

  if (data.items.length === 0) {
    const text =
      data.counts.all === 0
        ? "Выберите модели в каталоге и нажмите «Сменить формат»."
        : "По выбранному фильтру ничего не найдено.";
    const title = data.counts.all === 0 ? "Здесь пока пусто" : "Пусто";
    content.replaceChildren(h("div", { class: "empty-box" }, h("b", {}, title), text));
    return;
  }

  const head = ["Модель", "Форматы", "Состояние", "Оценка качества", "Создано", ""];
  const total = tab === "" ? data.counts.all : data.counts[tab as "active" | "done" | "failed"];
  content.replaceChildren(
    h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        { class: "table" },
        h("thead", {}, h("tr", {}, ...head.map((title) => h("th", {}, title)))),
        h("tbody", {}, ...data.items.map(buildRow)),
      ),
    ),
    buildPager(data.page, data.pageSize, total, data.items.length, (newPage) => {
      page = newPage;
      load();
    }),
  );
}

async function load(): Promise<void> {
  try {
    const currentTab = tab;
    const currentPage = page;
    const data = await getJobs(teamId, currentTab, currentPage);
    if (currentTab === tab && currentPage === page) render(data);
  } catch (error) {
    content.replaceChildren(
      h("div", { class: "empty-box" }, h("b", {}, "Не удалось загрузить список"), errorText(error)),
    );
  }
}

main.append(
  pageHead("Конвертация", "смена формата моделей и результаты обработки"),
  h(
    "div",
    { class: "demo-note" },
    "После конвертации доступен отчёт по геометрии и визуальной похожести с шести ракурсов. Улучшение текстур пока недоступно; демонстрационные оценки обозначены отдельно.",
  ),
  tabBar,
  content,
);
await load();
let refreshing = false;
setInterval(async () => {
  if (document.hidden || refreshing) return;
  refreshing = true;
  try {
    await load();
  } finally {
    refreshing = false;
  }
}, 2000);

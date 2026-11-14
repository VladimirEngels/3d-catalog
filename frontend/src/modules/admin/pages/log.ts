import { can, getSession } from "@shared/session";
import { h } from "@shared/ui/dom";
import { errorText } from "@shared/ui/form";
import { icon } from "@shared/ui/icons";
import { mountLayout, pageHead } from "@shared/ui/layout";
import { buildPager } from "@shared/ui/pager";
import { getTeamLog, type LogFilters, type LogResponse } from "../api";

const main = await mountLayout("log");
const session = await getSession();

if (!can(session, "viewLog")) {
  location.href = "/pages/catalog.html";
  await new Promise(() => {});
}

const team = session.team!;

const ACTION_NAMES: Record<string, string> = {
  login: "Вход",
  create: "Добавление",
  update: "Изменение",
  delete: "Удаление",
  download: "Скачивание",
  convert: "Перевод",
  invite: "Приглашение",
};

const filters: LogFilters = { user: "", action: "", days: "", query: "" };
let page = 0;
let authorsLoaded = false;

function formatMoment(value: string): string {
  const date = new Date(value);
  const day = date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  const time = date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${day}, ${time}`;
}

function buildFilterSelect(label: string, options: [string, string][], onChange: (value: string) => void): HTMLSelectElement {
  const select = h("select", { "aria-label": label }) as HTMLSelectElement;
  for (const [value, text] of options) {
    select.append(h("option", { value }, text));
  }
  select.addEventListener("change", () => {
    onChange(select.value);
    page = 0;
    load();
  });
  return select;
}

const userSelect = buildFilterSelect("Участник", [["", "Все участники"]], (value) => { filters.user = value; });
const actionSelect = buildFilterSelect(
  "Действие",
  [["", "Все действия"], ...Object.entries(ACTION_NAMES)],
  (value) => { filters.action = value; },
);
const periodSelect = buildFilterSelect(
  "Период",
  [["", "За всё время"], ["7", "За неделю"], ["30", "За месяц"]],
  (value) => { filters.days = value; },
);

const searchInput = h("input", { type: "text", placeholder: "Поиск по описанию", "aria-label": "Поиск по описанию" }) as HTMLInputElement;
let searchTimer: number | undefined;
searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    filters.query = searchInput.value;
    page = 0;
    load();
  }, 300);
});

const content = h("div", {});

function render(data: LogResponse): void {
  if (!authorsLoaded) {
    for (const author of data.authors) {
      userSelect.append(h("option", { value: String(author.id) }, author.name));
    }
    authorsLoaded = true;
  }

  if (data.items.length === 0) {
    content.replaceChildren(h("div", { class: "empty-box" }, h("b", {}, "Записей нет"), "Измените условия отбора."));
    return;
  }

  const body = h("tbody");
  for (const item of data.items) {
    body.append(h("tr", {},
      h("td", { class: "muted" }, formatMoment(item.createdAt)),
      h("td", {}, item.userName),
      h("td", {}, h("span", { class: "badge" }, ACTION_NAMES[item.action] ?? item.action)),
      h("td", { class: "file-name" }, item.details ?? "—"),
    ));
  }
  content.replaceChildren(
    h("div", { class: "table-wrap" },
      h("table", { class: "table" },
        h("thead", {}, h("tr", {}, h("th", {}, "Когда"), h("th", {}, "Кто"), h("th", {}, "Действие"), h("th", {}, "Что"))),
        body,
      ),
    ),
    buildPager(data.page, data.pageSize, data.total, data.items.length, (newPage) => {
      page = newPage;
      load();
    }),
  );
}

async function load(): Promise<void> {
  try {
    render(await getTeamLog(team.teamId, filters, page));
  } catch (error) {
    content.replaceChildren(h("div", { class: "empty-box" }, h("b", {}, "Не удалось загрузить журнал"), errorText(error)));
  }
}

main.append(
  pageHead("Журнал", "кто, когда и что сделал в команде"),
  h("div", { class: "filters-row" },
    userSelect,
    actionSelect,
    periodSelect,
    h("label", { class: "search log-search" }, icon("search"), searchInput),
  ),
  content,
);
await load();

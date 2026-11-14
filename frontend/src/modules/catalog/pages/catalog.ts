import { openCreateTeamDialog, showInvitationList } from "@modules/accounts/index";
import { openConvertDialog } from "@modules/conversion/index";
import { can, getSession } from "@shared/session";
import { changeSetting, readSettings } from "@shared/settings";
import { h } from "@shared/ui/dom";
import { errorText } from "@shared/ui/form";
import { icon } from "@shared/ui/icons";
import { mountLayout } from "@shared/ui/layout";
import { getCollections, getModels, type CatalogFilters, type CatalogItem, type CatalogResponse, type CatalogSort, type Collection } from "../api";
import { openAddToCollectionDialog } from "../components/collection-dialogs";
import { createAndSavePreview } from "../components/preview";
import { buildFilters, FORMATS, PERIOD_LABELS, QUALITY_LABELS } from "../components/filters";
import { buildTable, buildTile } from "../components/tile";
import "../catalog.css";

const main = await mountLayout("catalog");
const session = await getSession();

function emptyFilters(): CatalogFilters {
  return {
    query: "", formats: [], skeleton: false, textures: false, minTriangles: "", maxTriangles: "",
    quality: "", author: "", collection: "", days: "", sort: "new",
  };
}


function showNoTeam(): void {
  const newTeamButton = h("button", { class: "btn primary", type: "button" }, "Создать команду");
  newTeamButton.addEventListener("click", openCreateTeamDialog);
  const invitationsPanel = h("div", { class: "panel" });
  invitationsPanel.hidden = true;

  main.append(
    h("div", { class: "page-head" }, h("h1", {}, "Каталог")),
    h("div", { class: "panel" },
      h("h3", { class: "chart-title" }, "Вы пока не состоите ни в одной команде"),
      h("div", { class: "chart-sub" }, "Модели хранятся в командах. Создайте свою команду или примите приглашение."),
      newTeamButton,
    ),
    invitationsPanel,
  );
  showInvitationList(invitationsPanel);
}


function showCatalog(teamId: number): void {
  let filters = emptyFilters();
  filters.collection = new URLSearchParams(location.search).get("collection") ?? "";
  let collections: Collection[] = [];
  const selected = new Set<number>();
  let items: CatalogItem[] = [];
  let lastData: CatalogResponse | null = null;
  let page = 0;
  let viewMode = readSettings().catalogView;
  let requestNumber = 0;
  let panelIsStale = true;


  const countText = h("span", { class: "sub" });
  const chips = h("div", { class: "chips" });
  const results = h("div");
  const footer = h("div", { class: "load-more" });
  const filtersHolder = h("div", { class: "filters-holder" });
  main.before(filtersHolder);

  const head = h("div", { class: "page-head" }, h("h1", {}, "Каталог"), countText);
  if (can(session, "upload")) {
    head.append(h("div", { class: "actions" },
      h("a", { class: "btn primary", href: "/pages/upload.html" }, icon("plus"), "Добавить модель"),
    ));
  }

  const searchInput = h("input", { type: "text", placeholder: "Поиск по названию, описанию и тегам" }) as HTMLInputElement;
  let searchTimer: number | undefined;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      filters.query = searchInput.value;
      reload();
    }, 300);
  });

  const sortSelect = h("select", { class: "sort-select" }) as HTMLSelectElement;
  const sortOptions: [CatalogSort, string][] = [["new", "Сначала новые"], ["name", "По названию"], ["size", "По размеру"], ["quality", "По оценке качества"]];
  for (const [value, label] of sortOptions) {
    sortSelect.append(h("option", { value }, label));
  }
  sortSelect.addEventListener("change", () => {
    filters.sort = sortSelect.value as CatalogSort;
    reload();
  });

  const gridButton = h("button", { class: viewMode === "grid" ? "on" : "view", type: "button", title: "Плитки", "aria-label": "Плитки" }, icon("grid"));
  const tableButton = h("button", { class: viewMode === "table" ? "on" : "view", type: "button", title: "Таблица", "aria-label": "Таблица" }, icon("list"));
  function setViewMode(mode: "grid" | "table"): void {
    viewMode = mode;
    changeSetting("catalogView", mode);
    gridButton.classList.toggle("on", mode === "grid");
    tableButton.classList.toggle("on", mode === "table");
    renderResults();
  }
  gridButton.addEventListener("click", () => setViewMode("grid"));
  tableButton.addEventListener("click", () => setViewMode("table"));

  main.append(
    head,
    h("div", { class: "toolbar" },
      h("label", { class: "search" }, icon("search"), searchInput),
      sortSelect,
      h("div", { class: "segmented" }, gridButton, tableButton),
    ),
    chips,
    results,
    footer,
  );

  function resetFilters(): void {
    const sort = filters.sort;
    filters = emptyFilters();
    filters.sort = sort;
    searchInput.value = "";
    panelIsStale = true;
    reload();
  }

  function buildChip(label: string, onRemove: () => void): HTMLElement {
    const remove = h("button", { class: "x", type: "button", "aria-label": `Убрать: ${label}` }, "✕");
    remove.addEventListener("click", () => {
      onRemove();
      panelIsStale = true;
      reload();
    });
    return h("span", { class: "chip" }, label, remove);
  }

  function renderChips(data: CatalogResponse): void {
    const list: HTMLElement[] = [];
    for (const format of filters.formats) {
      const label = FORMATS.find((item) => item.value === format)?.label ?? format;
      list.push(buildChip(label, () => { filters.formats = filters.formats.filter((item) => item !== format); }));
    }
    if (filters.skeleton) list.push(buildChip("Есть скелет", () => { filters.skeleton = false; }));
    if (filters.textures) list.push(buildChip("Есть текстуры", () => { filters.textures = false; }));
    if (filters.minTriangles !== "") list.push(buildChip(`от ${filters.minTriangles} треуг.`, () => { filters.minTriangles = ""; }));
    if (filters.maxTriangles !== "") list.push(buildChip(`до ${filters.maxTriangles} треуг.`, () => { filters.maxTriangles = ""; }));
    if (filters.quality !== "") list.push(buildChip(QUALITY_LABELS[filters.quality], () => { filters.quality = ""; }));
    if (filters.collection !== "") {
      const collection = collections.find((item) => String(item.id) === filters.collection);
      list.push(buildChip(`Коллекция: ${collection?.name ?? filters.collection}`, () => { filters.collection = ""; }));
    }
    if (filters.author !== "") {
      const author = data.facets.authors.find((item) => String(item.id) === filters.author);
      list.push(buildChip(author?.name ?? "Автор", () => { filters.author = ""; }));
    }
    if (filters.days !== "") list.push(buildChip(PERIOD_LABELS[filters.days], () => { filters.days = ""; }));

    chips.replaceChildren(...list);
    chips.hidden = list.length === 0;
  }

  function renderResults(): void {
    if (lastData === null) {
      return;
    }
    if (lastData.teamTotal === 0) {
      const text = can(session, "upload") ? "Добавьте первую модель, и она появится здесь." : "Когда участники добавят модели, они появятся здесь.";
      results.replaceChildren(h("div", { class: "empty-box" }, h("b", {}, "В каталоге пока нет моделей"), text));
    } else if (items.length === 0) {
      const clear = h("button", { class: "btn", type: "button" }, "Сбросить фильтры");
      clear.addEventListener("click", resetFilters);
      results.replaceChildren(h("div", { class: "empty-box" }, h("b", {}, "Ничего не найдено"), "Измените условия поиска или сбросьте фильтры.", h("div", {}, clear)));
    } else if (viewMode === "grid") {
      results.replaceChildren(h("div", { class: "grid" }, ...items.map((item) => buildTile(teamId, item, selection))));
    } else {
      results.replaceChildren(buildTable(items));
    }

    footer.replaceChildren();
    if (items.length < lastData.found) {
      const more = h("button", { class: "btn", type: "button" }, `Показать ещё (осталось ${lastData.found - items.length})`);
      more.addEventListener("click", loadNextPage);
      footer.append(more);
    }
  }

  const bulkBar = h("div", { class: "bulkbar" });
  bulkBar.hidden = true;
  document.body.append(bulkBar);

  const selection = can(session, "collections")
    ? {
        isSelected: (id: number) => selected.has(id),
        toggle: (id: number) => {
          if (selected.has(id)) {
            selected.delete(id);
          } else {
            selected.add(id);
          }
          renderResults();
          renderBulkBar();
        },
      }
    : null;

  function clearSelection(): void {
    selected.clear();
    renderResults();
    renderBulkBar();
  }

  function renderBulkBar(): void {
    bulkBar.hidden = selected.size === 0;
    const addButton = h("button", { class: "btn small primary", type: "button" }, "В коллекцию");
    addButton.addEventListener("click", () => {
      openAddToCollectionDialog(teamId, [...selected], async () => {
        clearSelection();
        collections = await getCollections(teamId);
      });
    });
    const closeButton = h("button", { class: "btn small", type: "button", "aria-label": "Снять выбор" }, "✕");
    closeButton.addEventListener("click", clearSelection);
    const convertButton = h("button", { class: "btn small primary", type: "button" }, "Перевести в формат…");
    convertButton.addEventListener("click", () => {
      const models = items.filter((item) => selected.has(item.id));
      openConvertDialog(teamId, models.map((item) => ({
        id: item.id,
        name: item.name,
        format: item.format,
        hasSkeleton: item.hasSkeleton,
        hasTextures: item.hasTextures,
      })));
    });
    addButton.className = "btn small";
    bulkBar.replaceChildren(h("span", {}, `Выбрано: ${selected.size}`), convertButton, addButton, closeButton);
  }

  function render(data: CatalogResponse): void {
    lastData = data;
    countText.textContent = data.found === data.teamTotal ? `моделей: ${data.teamTotal}` : `найдено ${data.found} из ${data.teamTotal}`;
    if (panelIsStale) {
      filtersHolder.replaceChildren(buildFilters(filters, data, reload, resetFilters));
      panelIsStale = false;
    }
    renderChips(data);
    renderResults();
  }

  function showError(error: unknown): void {
    results.replaceChildren(h("div", { class: "empty-box" }, h("b", {}, "Не удалось загрузить каталог"), errorText(error)));
    footer.replaceChildren();
  }

  async function reload(): Promise<void> {
    requestNumber++;
    const thisRequest = requestNumber;
    page = 0;
    results.classList.add("is-loading");
    try {
      const data = await getModels(teamId, filters, 0);
      if (thisRequest !== requestNumber) {
        return;
      }
      items = data.items;
      render(data);
      createMissingPreviews();
    } catch (error) {
      showError(error);
    }
    results.classList.remove("is-loading");
  }

  let previewsInProgress = false;
  async function createMissingPreviews(): Promise<void> {
    if (previewsInProgress || session.team?.role !== "owner") {
      return;
    }
    previewsInProgress = true;
    for (const item of items.filter((model) => !model.hasPreview)) {
      if (await createAndSavePreview(teamId, item.id)) {
        item.hasPreview = true;
        renderResults();
      }
    }
    previewsInProgress = false;
  }

  async function loadNextPage(): Promise<void> {
    requestNumber++;
    const thisRequest = requestNumber;
    try {
      const data = await getModels(teamId, filters, page + 1);
      if (thisRequest !== requestNumber) {
        return;
      }
      page++;
      items = [...items, ...data.items];
      render(data);
    } catch (error) {
      showError(error);
    }
  }

  getCollections(teamId)
    .then((list) => { collections = list; })
    .catch(() => {})
    .finally(reload);
}

if (session.team === null) {
  showNoTeam();
} else {
  showCatalog(session.team.teamId);
}

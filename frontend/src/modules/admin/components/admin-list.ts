
import type { PagedList } from "../api";
import { h } from "@shared/ui/dom";
import { errorText } from "@shared/ui/form";
import { icon } from "@shared/ui/icons";
import { buildPager } from "@shared/ui/pager";

interface AdminListOptions<T> {
  searchPlaceholder: string;
  statusLabels: [string, string];
  columns: string[];
  emptyText: string;
  loadPage: (query: string, status: string, page: number) => Promise<PagedList<T>>;
  buildRow: (item: T, reload: () => void) => HTMLElement;
}

export function buildAdminList<T>(options: AdminListOptions<T>): HTMLElement {
  let query = "";
  let status = "";
  let page = 0;

  const content = h("div", {});

  async function load(): Promise<void> {
    try {
      const data = await options.loadPage(query, status, page);
      if (data.items.length === 0) {
        content.replaceChildren(h("div", { class: "empty-box" }, h("b", {}, options.emptyText)));
        return;
      }
      const body = h("tbody");
      for (const item of data.items) {
        body.append(options.buildRow(item, load));
      }
      content.replaceChildren(
        h("div", { class: "table-wrap" },
          h("table", { class: "table" },
            h("thead", {}, h("tr", {}, ...options.columns.map((title) => h("th", {}, title)))),
            body,
          ),
        ),
        buildPager(data.page, data.pageSize, data.total, data.items.length, (newPage) => {
          page = newPage;
          load();
        }),
      );
    } catch (error) {
      content.replaceChildren(h("div", { class: "empty-box" }, h("b", {}, "Не удалось загрузить список"), errorText(error)));
    }
  }

  const searchInput = h("input", { type: "text", placeholder: options.searchPlaceholder, "aria-label": options.searchPlaceholder }) as HTMLInputElement;
  let searchTimer: number | undefined;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      query = searchInput.value;
      page = 0;
      load();
    }, 300);
  });

  const statusSelect = h("select", { "aria-label": "Состояние" },
    h("option", { value: "" }, "Все"),
    h("option", { value: "active" }, options.statusLabels[0]),
    h("option", { value: "blocked" }, options.statusLabels[1]),
  ) as HTMLSelectElement;
  statusSelect.addEventListener("change", () => {
    status = statusSelect.value;
    page = 0;
    load();
  });

  load();
  return h("div", {},
    h("div", { class: "filters-row" }, h("label", { class: "search log-search" }, icon("search"), searchInput), statusSelect),
    content,
  );
}

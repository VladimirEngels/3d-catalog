
import { h } from "@shared/ui/dom";
import { formatBytes, formatDate, formatNumber } from "@shared/ui/format";
import { icon } from "@shared/ui/icons";
import { previewUrl, type CatalogItem } from "../api";

const GOOD_QUALITY = 80;
const BAD_QUALITY = 50;

function modelLink(id: number): string {
  return `/pages/model.html?id=${id}`;
}

function buildScore(quality: number | null): HTMLElement | null {
  if (quality === null) {
    return null;
  }
  let level = "err";
  if (quality >= GOOD_QUALITY) {
    level = "ok";
  } else if (quality >= BAD_QUALITY) {
    level = "warn";
  }
  return h("span", { class: `score ${level}` }, `${Math.round(quality)} %`);
}

export interface TileSelection {
  isSelected: (id: number) => boolean;
  toggle: (id: number) => void;
}

function buildPreview(teamId: number, item: CatalogItem, selection: TileSelection | null): HTMLElement {
  const content = item.hasPreview
    ? h("img", { src: previewUrl(teamId, item.id), alt: "", loading: "lazy" })
    : icon("box");

  let selectBox: HTMLElement | null = null;
  if (selection !== null) {
    selectBox = h("button", { class: "select-box", type: "button", "aria-label": `Выбрать: ${item.name}`, title: "Выбрать" });
    selectBox.addEventListener("click", (event) => {
      event.preventDefault();
      selection.toggle(item.id);
    });
  }
  return h("div", { class: "preview" }, content, selectBox, buildScore(item.quality));
}

export function buildTile(teamId: number, item: CatalogItem, selection: TileSelection | null): HTMLElement {
  const tags = item.tags.slice(0, 3).map((tag) => h("span", { class: "tag" }, `#${tag}`));
  const selected = selection !== null && selection.isSelected(item.id);
  return h("a", { class: selected ? "tile selected" : "tile", href: modelLink(item.id) },
    buildPreview(teamId, item, selection),
    h("div", { class: "tile-body" },
      h("div", { class: "tile-title", title: item.name }, item.name),
      h("div", { class: "tile-meta" },
        h("span", { class: "badge" }, item.format),
        `${formatNumber(item.triangles)} треуг. · ${formatBytes(item.sizeBytes)}`,
      ),
      h("div", { class: "tile-tags" }, ...tags),
    ),
  );
}

export function buildTable(items: CatalogItem[]): HTMLElement {
  const body = h("tbody");
  for (const item of items) {
    body.append(h("tr", {},
      h("td", {}, h("a", { href: modelLink(item.id) }, item.name)),
      h("td", {}, h("span", { class: "badge" }, item.format)),
      h("td", {}, formatNumber(item.triangles)),
      h("td", {}, formatBytes(item.sizeBytes)),
      h("td", {}, buildScore(item.quality) ?? "—"),
      h("td", {}, item.authorName),
      h("td", { class: "muted" }, formatDate(item.createdAt)),
    ));
  }
  const head = ["Название", "Формат", "Треугольников", "Размер", "Оценка", "Автор", "Добавлена"];
  return h("div", { class: "table-wrap" },
    h("table", { class: "table" },
      h("thead", {}, h("tr", {}, ...head.map((title) => h("th", {}, title)))),
      body,
    ),
  );
}

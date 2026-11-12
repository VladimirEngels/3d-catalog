import type { CatalogItem } from "../../../shared/api/types";
import { h } from "../../../shared/ui/dom";

export function createTile(item: CatalogItem): HTMLElement {
  const formats = item.formats.join(" · ");
  const triangles = item.version.triangles_count.toLocaleString("ru-RU");

  const tile = h("a", "tile",
    h("div", "tile-preview", formats),
    h("h3", "tile-title", item.model.name),
    h("div", "tile-meta", `${triangles} треугольников`),
  );
  tile.setAttribute("href", `/pages/model.html?id=${item.model.id}`);
  return tile;
}

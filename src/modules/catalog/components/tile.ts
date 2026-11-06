import type { CatalogItem } from "../../../shared/api/types";
import { h } from "../../../shared/ui/dom";

export function createTile(item: CatalogItem): HTMLElement {
  const formats = item.formats.join(" · ");                       
  const triangles = item.version.triangles_count.toLocaleString("ru-RU");  

  return h("article", "tile",
    h("div", "tile-preview", formats),
    h("h3", "tile-title", item.model.name),
    h("div", "tile-meta", `${triangles} треугольников`),
  );
}

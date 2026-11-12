import type { CatalogItem } from "../../../shared/api/types";
import { h } from "../../../shared/ui/dom";

export function createTile(item: CatalogItem): HTMLElement {
    const triangles = item.version.triangles_count.toLocaleString("ru-RU");

    const badges = item.formats.map((format) =>
        h("span", "format-badge", format)
    );

    const title = h("h3", "tile-title", item.model.name);
    title.setAttribute("title", item.model.name);

    const preview = h("div", "tile-preview",
        h("span", "tile-placeholder", "Нет превью")
    );

    const body = h("div", "tile-body",
        title,
        h("div", "tile-meta",
            ...badges,
            h("span", "", `${triangles} треуг.`)
        )
    );

    const tile = h("a", "tile", preview, body);
    tile.setAttribute("href", `/pages/model.html?id=${item.model.id}`);

    return tile;
}
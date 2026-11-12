import type { CatalogItem } from "../../../shared/api/types";
import { h } from "../../../shared/ui/dom";

export function createTable(items: CatalogItem[]): HTMLElement {
    const headings = ["Название", "Форматы", "Треугольников", "Скелет"];

    const headers = headings.map((text) => {
        const cell = h("th", "", text);
        cell.setAttribute("scope", "col");
        return cell;
    });

    const rows = items.map((item) => {
        const link = h("a", "", item.model.name);
        link.setAttribute("href", `/pages/model.html?id=${item.model.id}`);

        return h("tr", "",
            h("td", "", link),
            h("td", "", item.formats.join(", ")),
            h("td", "", item.version.triangles_count.toLocaleString("ru-RU")),
            h("td", "", item.version.has_skeleton ? "есть" : "нет")
        );
    });

    const table = h("table", "catalog-table",
        h("thead", "", h("tr", "", ...headers)),
        h("tbody", "", ...rows)
    );

    return h("div", "catalog-table-wrap", table);
}
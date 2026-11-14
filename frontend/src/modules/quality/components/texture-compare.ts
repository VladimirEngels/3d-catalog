
import { h } from "@shared/ui/dom";
import { formatBytes } from "@shared/ui/format";
import "../quality.css";

interface TextureInfo {
  id: number;
  name: string;
  width: number;
  height: number;
  sizeBytes: number;
  improved: { id: number; width: number; height: number } | null;
}

function textureUrl(teamId: number, modelId: number, textureId: number): string {
  return `/api/teams/${teamId}/models/${modelId}/textures/${textureId}`;
}

function canShowInBrowser(name: string): boolean {
  return !name.toLowerCase().endsWith(".tga");
}

function buildCard(teamId: number, modelId: number, texture: TextureInfo): HTMLElement {
  const picture = canShowInBrowser(texture.name)
    ? h("img", { src: textureUrl(teamId, modelId, texture.id), alt: "", loading: "lazy" })
    : "Просмотр недоступен";
  return h("div", { class: "texture-card" },
    h("div", { class: "pic" }, picture),
    h("div", { class: "tile-body" },
      h("div", { class: "tile-title", title: texture.name }, texture.name),
      h("div", { class: "muted" }, `${texture.width}×${texture.height} · ${formatBytes(texture.sizeBytes)}`),
    ),
  );
}

function buildCompare(teamId: number, modelId: number, texture: TextureInfo): HTMLElement {
  const improved = texture.improved!;
  return h("div", { class: "compare-grid" },
    h("div", { class: "panel" },
      h("h3", { class: "chart-title" }, `До · ${texture.width}×${texture.height}`),
      h("div", { class: "chart-sub" }, "Исходная текстура"),
      h("img", { src: textureUrl(teamId, modelId, texture.id), alt: "Текстура до улучшения" }),
    ),
    h("div", { class: "panel" },
      h("h3", { class: "chart-title" }, `После · ${improved.width}×${improved.height}`),
      h("div", { class: "chart-sub" }, "Заготовленный пример"),
      h("img", { src: textureUrl(teamId, modelId, improved.id), alt: "Текстура после улучшения" }),
    ),
  );
}

export function showTextureCompare(container: HTMLElement, teamId: number, modelId: number, textures: TextureInfo[]): void {
  if (textures.length === 0) {
    container.replaceChildren(h("div", { class: "empty-box" }, h("b", {}, "Текстур нет"), "В этой версии модели нет текстур."));
    return;
  }

  const improved = textures.filter((texture) => texture.improved !== null);
  const grid = h("div", { class: "texture-grid" }, ...textures.map((texture) => buildCard(teamId, modelId, texture)));

  if (improved.length === 0) {
    container.replaceChildren(grid);
    return;
  }

  const compareBox = h("div", {}, buildCompare(teamId, modelId, improved[0]));
  const parts: HTMLElement[] = [];
  if (improved.length > 1) {
    const select = h("select") as HTMLSelectElement;
    improved.forEach((texture, index) => select.append(h("option", { value: String(index) }, texture.name)));
    select.addEventListener("change", () => compareBox.replaceChildren(buildCompare(teamId, modelId, improved[Number(select.value)])));
    parts.push(h("div", { class: "qc-toolbar" }, h("span", {}, "Текстура:"), select));
  }
  parts.unshift(h("div", { class: "demo-note" }, "Нейросеть пока не подключена: «после» — заготовленный пример, как будет выглядеть результат."));
  parts.push(compareBox, h("h3", { class: "chart-title all-textures" }, "Все текстуры"), grid);
  container.replaceChildren(...parts);
}

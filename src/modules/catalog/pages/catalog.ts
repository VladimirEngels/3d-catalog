import type { CatalogItem, FileFormat } from "../../../shared/api/types";
import { h } from "../../../shared/ui/dom";
import { getModels } from "../api";
import { createTile } from "../components/tile";
import { mountMenu } from "../../../shared/ui/layout";

const tilesBox = document.querySelector(".tiles") as HTMLElement;
const countText = document.querySelector("#count") as HTMLElement;
const searchInput = document.querySelector("#search") as HTMLInputElement;
const sortSelect = document.querySelector("#sort") as HTMLSelectElement;
const formatSelect = document.querySelector("#format") as HTMLSelectElement;
const skeletonCheck = document.querySelector("#skeleton") as HTMLInputElement;
const resetButton = document.querySelector("#reset") as HTMLButtonElement;
const minTrianglesInput = document.querySelector(
  "#min-triangles",
) as HTMLInputElement;
const maxTrianglesInput = document.querySelector(
  "#max-triangles",
) as HTMLInputElement;

let allModels: CatalogItem[] = [];

function showTiles(): void {
  const text = searchInput.value.trim().toLowerCase();

  const minTriangles =
    minTrianglesInput.value === "" ? 0 : minTrianglesInput.valueAsNumber;

  const maxTriangles =
    maxTrianglesInput.value === "" ? Infinity : maxTrianglesInput.valueAsNumber;

  if (
    !minTrianglesInput.validity.valid ||
    !maxTrianglesInput.validity.valid ||
    minTriangles > maxTriangles
  ) {
    countText.textContent = "проверьте диапазон";

    tilesBox.replaceChildren(
      h(
        "p",
        "muted",
        "Укажите целые числа от 0. Значение «От» не должно превышать «До».",
      ),
    );

    return;
  }

  let list = allModels.filter((item) => {
    const name = item.model.name.toLowerCase();
    const description = (item.model.description ?? "").toLowerCase();

    return name.includes(text) || description.includes(text);
  });

  if (formatSelect.value !== "") {
    const format = formatSelect.value as FileFormat;
    list = list.filter((item) => item.formats.includes(format));
  }
  if (skeletonCheck.checked) {
    list = list.filter((item) => item.version.has_skeleton);
  }

  list = list.filter(
    (item) =>
      item.version.triangles_count >= minTriangles &&
      item.version.triangles_count <= maxTriangles,
  );

  if (sortSelect.value === "name") {
    list.sort((a, b) => a.model.name.localeCompare(b.model.name, "ru"));
  } else if (sortSelect.value === "triangles") {
    list.sort((a, b) => b.version.triangles_count - a.version.triangles_count);
  } else {
    list.sort((a, b) => b.model.created_at.localeCompare(a.model.created_at));
  }

  countText.textContent = `найдено: ${list.length}`;
  if (list.length === 0) {
    tilesBox.replaceChildren(h("p", "muted", "Ничего не найдено"));
  } else {
    tilesBox.replaceChildren(...list.map(createTile));
  }
}

function resetFilters(): void {
  searchInput.value = "";
  formatSelect.value = "";
  skeletonCheck.checked = false;
  minTrianglesInput.value = "";
  maxTrianglesInput.value = "";
  showTiles();
}

async function start(): Promise<void> {
  mountMenu("catalog");

  allModels = await getModels();
  showTiles();

  searchInput.addEventListener("input", showTiles);
  sortSelect.addEventListener("change", showTiles);
  formatSelect.addEventListener("change", showTiles);
  skeletonCheck.addEventListener("change", showTiles);
  resetButton.addEventListener("click", resetFilters);
  minTrianglesInput.addEventListener("input", showTiles);
  maxTrianglesInput.addEventListener("input", showTiles);
}

start();

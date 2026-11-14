import { openConvertDialog } from "@modules/conversion/index";
import { showQualityReport, showTextureCompare } from "@modules/quality/index";
import { openNewVersionDialog } from "@modules/upload/index";
import { can, getSession } from "@shared/session";
import { confirmAction, showMessage } from "@shared/ui/dialog";
import { h } from "@shared/ui/dom";
import { errorText } from "@shared/ui/form";
import { formatBytes, formatDate, formatNumber } from "@shared/ui/format";
import { mountLayout } from "@shared/ui/layout";
import { deleteModel, fileDownloadUrl, getModel, getModelView, removeModelFromCollection, versionDownloadUrl, type ModelCard } from "../api";
import { openAddToCollectionDialog } from "../components/collection-dialogs";
import { openEditDialog } from "../components/edit-model";
import { createAndSavePreview } from "../components/preview";
import { showViewer } from "../components/viewer";
import "../catalog.css";

const main = await mountLayout("catalog");
const session = await getSession();
const modelId = Number(new URLSearchParams(location.search).get("id"));

function showProblem(title: string, text: string): void {
  main.replaceChildren(
    h("div", { class: "crumbs" }, h("a", { href: "/pages/catalog.html" }, "Каталог")),
    h("div", { class: "empty-box" }, h("b", {}, title), text),
  );
}

function formatSize(size: [number, number, number]): string {
  return size.map((value) => value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })).join(" × ");
}

function describeTextures(card: ModelCard): string {
  if (card.textures.length === 0) {
    return "нет";
  }
  const largest = card.textures.reduce((best, texture) => (texture.width * texture.height > best.width * best.height ? texture : best));
  return `${card.textures.length} · до ${largest.width}×${largest.height}`;
}

function prop(label: string, value: string): HTMLElement[] {
  return [h("dt", {}, label), h("dd", {}, value)];
}

function buildInfoPanel(teamId: number, card: ModelCard): HTMLElement {
  const { current } = card;
  const actions = h("div", { class: "btn-row" },
    h("a", { class: "btn primary", href: versionDownloadUrl(teamId, card.id, current.versionId) }, "Скачать"),
  );

  if (can(session, "convert")) {
    const convertButton = h("button", { class: "btn", type: "button" }, "Перевести…");
    convertButton.addEventListener("click", () => {
      openConvertDialog(teamId, [{
        id: card.id,
        name: card.name,
        format: current.format,
        hasSkeleton: current.hasSkeleton,
        hasTextures: card.textures.length > 0,
      }]);
    });
    actions.append(convertButton);
  }

  if (card.canEdit) {
    const editButton = h("button", { class: "btn", type: "button" }, "Изменить");
    editButton.addEventListener("click", () => openEditDialog(teamId, card));
    actions.append(editButton);
  }

  const tagList = h("div", { class: "tag-list" });
  for (const tag of card.tags) {
    const pill = h("span", { class: tag.isAuto ? "tag-pill auto" : "tag-pill" }, tag.name);
    if (tag.isAuto) {
      pill.title = "Тег поставлен системой автоматически";
    }
    tagList.append(pill);
  }
  if (card.tags.length === 0) {
    tagList.append(h("span", { class: "panel-empty" }, "Тегов пока нет"));
  }

  const canManageCollections = can(session, "collections");
  const collections = h("div", { class: "tag-list" });
  for (const collection of card.collections) {
    const pill = h("span", { class: "tag-pill" }, h("a", { class: "pill-link", href: `/pages/catalog.html?collection=${collection.id}` }, collection.name));
    if (canManageCollections) {
      const remove = h("button", { class: "pill-remove", type: "button", "aria-label": `Убрать из коллекции ${collection.name}` }, "✕");
      remove.addEventListener("click", async () => {
        try {
          await removeModelFromCollection(teamId, collection.id, card.id);
          location.reload();
        } catch (error) {
          showMessage("Не удалось убрать модель из коллекции", errorText(error));
        }
      });
      pill.append(remove);
    }
    collections.append(pill);
  }
  if (card.collections.length === 0) {
    collections.append(h("span", { class: "panel-empty" }, "Не входит в коллекции"));
  }
  if (canManageCollections) {
    const addButton = h("button", { class: "btn link pill-add", type: "button" }, "+ в коллекцию");
    addButton.addEventListener("click", () => openAddToCollectionDialog(teamId, [card.id], () => location.reload()));
    collections.append(addButton);
  }

  const panel = h("div", { class: "panel" },
    h("h2", { class: "model-title" }, card.name),
    h("div", { class: "author" }, `${card.authorName} · добавлена ${formatDate(card.createdAt)}`),
    actions,
    h("h3", {}, "Характеристики"),
    h("dl", { class: "props" },
      ...prop("Формат", current.format),
      ...prop("Треугольников", formatNumber(current.triangles)),
      ...prop("Вершин", formatNumber(current.vertices)),
      ...prop("Текстур", describeTextures(card)),
      ...prop("Материалов", String(current.materials.length)),
      ...prop("Скелет", current.hasSkeleton ? "есть" : "нет"),
      ...prop("Габариты", formatSize(current.size)),
      ...prop("Размер файла", formatBytes(current.sizeBytes)),
    ),
    h("h3", {}, "Описание"),
    h("div", { class: "model-description" }, card.description ?? "Описания пока нет"),
    h("h3", {}, "Теги"),
    tagList,
    h("h3", {}, "Коллекции"),
    collections,
  );

  if (card.canDelete) {
    const deleteButton = h("button", { class: "btn danger-button", type: "button" }, "Удалить модель…");
    deleteButton.addEventListener("click", async () => {
      const agreed = await confirmAction(
        `Удалить модель «${card.name}»?`,
        "Будут удалены все её версии и файлы. Отменить это нельзя.",
        "Удалить навсегда",
      );
      if (!agreed) {
        return;
      }
      try {
        await deleteModel(teamId, card.id);
        location.href = "/pages/catalog.html";
      } catch (error) {
        showMessage("Не удалось удалить модель", errorText(error));
      }
    });
    panel.append(h("div", { class: "model-actions" }, deleteButton));
  }
  return panel;
}

function buildFilesTab(teamId: number, card: ModelCard): HTMLElement {
  const body = h("tbody");
  for (const file of card.files) {
    body.append(h("tr", {},
      h("td", { class: "file-name" }, file.name),
      h("td", {}, h("span", { class: "badge" }, file.format)),
      h("td", {}, file.converted ? "Получен переводом" : "Исходный"),
      h("td", {}, formatBytes(file.sizeBytes)),
      h("td", { class: "muted" }, formatDate(file.createdAt)),
      h("td", {}, h("a", { class: "btn small", href: fileDownloadUrl(teamId, card.id, file.id) }, "Скачать")),
    ));
  }
  const head = ["Файл", "Формат", "Откуда", "Размер", "Добавлен", ""];
  return h("div", { class: "table-wrap" },
    h("table", { class: "table" }, h("thead", {}, h("tr", {}, ...head.map((title) => h("th", {}, title)))), body),
  );
}

function buildVersionsTab(teamId: number, card: ModelCard): HTMLElement {
  const body = h("tbody");
  for (const version of card.versions) {
    const isCurrent = version.id === card.current.versionId;
    body.append(h("tr", {},
      h("td", {}, h("b", {}, String(version.number)), " ", isCurrent ? h("span", { class: "status done" }, "текущая") : null),
      h("td", {}, version.comment ?? (version.number === 1 ? "Модель добавлена" : "Новая версия")),
      h("td", {}, formatNumber(version.triangles)),
      h("td", {}, formatBytes(version.sizeBytes)),
      h("td", { class: "muted" }, formatDate(version.createdAt)),
      h("td", {}, h("a", { class: "btn small", href: versionDownloadUrl(teamId, card.id, version.id) }, "Скачать")),
    ));
  }
  const head = ["Версия", "Что изменилось", "Треугольников", "Размер", "Дата", ""];
  const table = h("div", { class: "table-wrap" },
    h("table", { class: "table" }, h("thead", {}, h("tr", {}, ...head.map((title) => h("th", {}, title)))), body),
  );

  const content = h("div", {});
  if (card.canEdit) {
    const addButton = h("button", { class: "btn", type: "button" }, "Загрузить новую версию");
    addButton.addEventListener("click", () => openNewVersionDialog(teamId, card.id));
    content.append(h("div", { class: "tab-actions" }, addButton));
  }
  content.append(table);
  return content;
}

function buildTabs(teamId: number, card: ModelCard): HTMLElement[] {
  const panels = new Map<string, HTMLElement>();

  const qualityPanel = h("div", {});
  const texturesPanel = h("div", {});
  showQualityReport(qualityPanel, teamId, card.id);
  showTextureCompare(texturesPanel, teamId, card.id, card.textures);

  panels.set("quality", qualityPanel);
  panels.set("files", buildFilesTab(teamId, card));
  panels.set("versions", buildVersionsTab(teamId, card));
  panels.set("textures", texturesPanel);

  const tabs: [string, string, number | null][] = [
    ["quality", "Контроль качества", null],
    ["files", "Файлы", card.files.length],
    ["versions", "Версии", card.versions.length],
    ["textures", "Текстуры", card.textures.length],
  ];

  const tabBar = h("div", { class: "tabs" });
  const content = h("div", {});

  function open(id: string): void {
    for (const link of tabBar.querySelectorAll("a")) {
      link.classList.toggle("active", link.dataset.tab === id);
    }
    content.replaceChildren(panels.get(id)!);
  }

  for (const [id, label, count] of tabs) {
    const link = h("a", { href: `#${id}`, "data-tab": id }, label, count === null ? null : h("span", { class: "count" }, String(count)));
    link.addEventListener("click", (event) => {
      event.preventDefault();
      open(id);
      history.replaceState(null, "", `#${id}`);
    });
    tabBar.append(link);
  }

  const fromAddress = location.hash.slice(1);
  open(panels.has(fromAddress) ? fromAddress : "quality");
  return [tabBar, content];
}

async function showCard(teamId: number): Promise<void> {
  const card = await getModel(teamId, modelId);
  document.title = `${card.name} — 3D-Каталог`;

  const viewerBox = h("div", { class: "viewer" });

  main.append(
    h("div", { class: "crumbs" }, h("a", { href: "/pages/catalog.html" }, "Каталог"), ` / ${card.name}`),
    h("div", { class: "model-top" }, viewerBox, buildInfoPanel(teamId, card)),
    ...buildTabs(teamId, card),
  );

  const view = await getModelView(teamId, card.id);
  let closeViewer = await showViewer(viewerBox, view);

  const converted = card.files.filter((file) => file.converted);
  if (converted.length > 0) {
    const select = h("select", { class: "viewer-files", "aria-label": "Какой файл показать" },
      h("option", { value: "" }, "Исходный файл"),
      ...converted.map((file) => h("option", { value: String(file.id) }, `Перевод: ${file.format}`)),
    ) as HTMLSelectElement;
    select.addEventListener("change", async () => {
      const file = converted.find((item) => String(item.id) === select.value);
      closeViewer();
      select.disabled = true;
      closeViewer = await showViewer(viewerBox, file
        ? { format: file.format, mainUrl: `/api/teams/${teamId}/models/${card.id}/files/${file.id}`, assets: [] }
        : view);
      select.disabled = false;
    });
    viewerBox.append(select);
  }

  if (!card.current.hasPreview && card.canEdit) {
    createAndSavePreview(teamId, card.id);
  }
}

if (session.team === null) {
  showProblem("Нет команды", "Модели хранятся в командах. Вернитесь в каталог, чтобы создать команду или принять приглашение.");
} else if (!Number.isInteger(modelId) || modelId < 1) {
  showProblem("Модель не указана", "Откройте модель из каталога.");
} else {
  try {
    await showCard(session.team.teamId);
  } catch (error) {
    showProblem("Модель не найдена", errorText(error));
  }
}

import { openConvertDialog } from "@modules/conversion/index";
import { showQualityReport, showTextureCompare } from "@modules/quality/index";
import { openNewVersionDialog } from "@modules/upload/index";
import { can, getSession } from "@shared/session";
import { confirmAction, showMessage } from "@shared/ui/dialog";
import { h } from "@shared/ui/dom";
import { errorText } from "@shared/ui/form";
import { formatBytes, formatDate, formatMoment, formatNumber } from "@shared/ui/format";
import { mountLayout } from "@shared/ui/layout";
import {
  deleteModel,
  fileDownloadUrl,
  getModel,
  getModelView,
  removeModelFromCollection,
  versionDownloadUrl,
  type ModelCard,
  type ModelFile,
} from "../api";
import { openAddToCollectionDialog } from "../components/collection-dialogs";
import { openEditDialog } from "../components/edit-model";
import { createAndSavePreview } from "../components/preview";
import { showViewer } from "../components/viewer";
import "../catalog.css";

const main = await mountLayout("catalog");
const session = await getSession();
const modelId = Number(new URLSearchParams(location.search).get("id"));
const requestedJobId = Number(new URLSearchParams(location.search).get("result"));

function showProblem(title: string, text: string): void {
  main.replaceChildren(
    h("div", { class: "crumbs" }, h("a", { href: "/pages/catalog.html" }, "Каталог")),
    h("div", { class: "empty-box" }, h("b", {}, title), text),
  );
}

function formatSize(size: [number, number, number]): string {
  return size
    .map((value) => value.toLocaleString("ru-RU", { maximumFractionDigits: 2 }))
    .join(" × ");
}

function describeTextures(card: ModelCard): string {
  if (card.textures.length === 0) {
    return "нет";
  }
  const largest = card.textures.reduce((best, texture) =>
    texture.width * texture.height > best.width * best.height ? texture : best,
  );
  return `${card.textures.length} · до ${largest.width}×${largest.height}`;
}

function prop(label: string, value: string): HTMLElement[] {
  return [h("dt", {}, label), h("dd", {}, value)];
}

function buildInfoPanel(teamId: number, card: ModelCard, activeResult?: ModelFile): HTMLElement {
  const { current } = card;
  const actions = h(
    "div",
    { class: "btn-row" },
    h(
      "a",
      {
        class: "btn primary model-download",
        href: activeResult
          ? fileDownloadUrl(teamId, card.id, activeResult.id)
          : versionDownloadUrl(teamId, card.id, current.versionId),
      },
      activeResult ? "Скачать результат" : "Скачать исходный",
    ),
  );

  if (can(session, "convert")) {
    const convertButton = h("button", { class: "btn", type: "button" }, "Сменить формат…");
    convertButton.addEventListener("click", () => {
      openConvertDialog(teamId, [
        {
          id: card.id,
          name: card.name,
          format: current.format,
          hasSkeleton: current.hasSkeleton,
          hasTextures: card.textures.length > 0,
        },
      ]);
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
    const pill = h(
      "span",
      { class: "tag-pill" },
      h(
        "a",
        { class: "pill-link", href: `/pages/catalog.html?collection=${collection.id}` },
        collection.name,
      ),
    );
    if (canManageCollections) {
      const remove = h(
        "button",
        {
          class: "pill-remove",
          type: "button",
          "aria-label": `Убрать из коллекции ${collection.name}`,
        },
        "✕",
      );
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
    addButton.addEventListener("click", () =>
      openAddToCollectionDialog(teamId, [card.id], () => location.reload()),
    );
    collections.append(addButton);
  }

  const panel = h(
    "div",
    { class: "panel" },
    h("h2", { class: "model-title" }, card.name),
    h("div", { class: "author" }, `${card.authorName} · добавлена ${formatDate(card.createdAt)}`),
    actions,
    h("h3", {}, `Исходная версия v${card.current.versionNumber}`),
    h(
      "dl",
      { class: "props" },
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
    const deleteButton = h(
      "button",
      { class: "btn danger-button", type: "button" },
      "Удалить модель…",
    );
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

function buildFilesTab(
  teamId: number,
  card: ModelCard,
  activeResult?: ModelFile,
  resultNumber?: number,
): HTMLElement {
  const body = h("tbody");
  const files = card.files.filter((file) => !file.converted);
  if (activeResult) files.push(activeResult);
  for (const file of files) {
    body.append(
      h(
        "tr",
        {},
        h("td", { class: "file-name" }, file.name),
        h("td", {}, h("span", { class: "badge" }, file.format)),
        h("td", {}, file.converted ? `Результат №${resultNumber}` : "Исходный"),
        h("td", {}, formatBytes(file.sizeBytes)),
        h("td", { class: "muted" }, formatDate(file.createdAt)),
        h(
          "td",
          {},
          h(
            "a",
            { class: "btn small", href: fileDownloadUrl(teamId, card.id, file.id) },
            "Скачать",
          ),
        ),
      ),
    );
  }
  const head = ["Файл", "Формат", "Откуда", "Размер", "Добавлен", ""];
  return h(
    "div",
    { class: "table-wrap" },
    h(
      "table",
      { class: "table" },
      h("thead", {}, h("tr", {}, ...head.map((title) => h("th", {}, title)))),
      body,
    ),
  );
}

function buildVersionsTab(
  teamId: number,
  card: ModelCard,
  converted: ModelFile[],
  activeResult?: ModelFile,
): HTMLElement {
  const body = h("tbody");
  for (const version of card.versions) {
    const isCurrent = version.id === card.current.versionId;
    body.append(
      h(
        "tr",
        {},
        h(
          "td",
          {},
          h("b", {}, String(version.number)),
          " ",
          isCurrent ? h("span", { class: "status done" }, "текущая") : null,
        ),
        h(
          "td",
          {},
          version.comment ?? (version.number === 1 ? "Модель добавлена" : "Новая версия"),
        ),
        h("td", {}, formatNumber(version.triangles)),
        h("td", {}, formatBytes(version.sizeBytes)),
        h("td", { class: "muted" }, formatDate(version.createdAt)),
        h(
          "td",
          {},
          h(
            "a",
            { class: "btn small", href: versionDownloadUrl(teamId, card.id, version.id) },
            "Скачать",
          ),
        ),
      ),
    );
  }
  const head = ["Версия", "Что изменилось", "Треугольников", "Размер", "Дата", ""];
  const table = h(
    "div",
    { class: "table-wrap" },
    h(
      "table",
      { class: "table" },
      h("thead", {}, h("tr", {}, ...head.map((title) => h("th", {}, title)))),
      body,
    ),
  );

  const content = h("div", {});
  if (card.canEdit) {
    const addButton = h("button", { class: "btn", type: "button" }, "Загрузить новую версию");
    addButton.addEventListener("click", () => openNewVersionDialog(teamId, card.id));
    content.append(h("div", { class: "tab-actions" }, addButton));
  }
  const history = h("tbody");
  converted.forEach((file, index) => {
    const number = converted.length - index;
    history.append(
      h(
        "tr",
        {},
        h(
          "td",
          {},
          h("b", {}, `№${number}`),
          " ",
          index === 0
            ? h("span", { class: "status done" }, "последняя")
            : file.id === activeResult?.id
              ? h("span", { class: "status done" }, "открыта")
              : null,
        ),
        h("td", {}, `v${file.sourceVersionNumber} · ${file.sourceFormat} → ${file.format}`),
        h("td", { class: "muted" }, formatMoment(file.createdAt)),
        h("td", {}, formatBytes(file.sizeBytes)),
        h(
          "td",
          {},
          h(
            "a",
            { class: "btn small", href: `/pages/model.html?id=${card.id}&result=${file.jobId}#quality` },
            "Открыть",
          ),
        ),
        h(
          "td",
          {},
          h("a", { class: "btn small", href: fileDownloadUrl(teamId, card.id, file.id) }, "Скачать"),
        ),
      ),
    );
  });
  content.append(
    table,
    h("h3", { class: "history-heading" }, "История конвертаций"),
    converted.length
      ? h(
          "div",
          { class: "table-wrap" },
          h(
            "table",
            { class: "table" },
            h(
              "thead",
              {},
              h(
                "tr",
                {},
                ...["Результат", "Исходная версия и формат", "Создан", "Размер", "", ""].map((title) =>
                  h("th", {}, title),
                ),
              ),
            ),
            history,
          ),
        )
      : h("p", { class: "muted" }, "Конвертаций пока нет."),
  );
  return content;
}

function buildTabs(
  teamId: number,
  card: ModelCard,
  converted: ModelFile[],
  activeResult?: ModelFile,
): HTMLElement[] {
  const panels = new Map<string, HTMLElement>();

  const qualityPanel = h("div", {});
  const texturesPanel = h("div", {});
  const resultNumber = activeResult ? converted.length - converted.indexOf(activeResult) : undefined;
  const reportJobId = requestedJobId > 0 ? requestedJobId : activeResult?.jobId ?? null;
  showQualityReport(
    qualityPanel,
    teamId,
    card.id,
    reportJobId,
    card.current.versionNumber,
    resultNumber,
  );
  showTextureCompare(texturesPanel, teamId, card.id, card.textures);

  panels.set("quality", qualityPanel);
  panels.set("files", buildFilesTab(teamId, card, activeResult, resultNumber));
  panels.set("versions", buildVersionsTab(teamId, card, converted, activeResult));
  panels.set("textures", texturesPanel);

  const tabs: [string, string, number | null][] = [
    ["quality", "Контроль качества", null],
    ["files", "Файлы", card.files.filter((file) => !file.converted).length + Number(Boolean(activeResult))],
    ["versions", "Версии", card.versions.length + converted.length],
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
    const link = h(
      "a",
      { href: `#${id}`, "data-tab": id },
      label,
      count === null ? null : h("span", { class: "count" }, String(count)),
    );
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
  const converted = card.files.filter((file) => file.converted).sort((a, b) => b.id - a.id);
  const activeResult =
    requestedJobId > 0
      ? converted.find((file) => file.jobId === requestedJobId)
      : converted.find((file) => file.sourceVersionNumber === card.current.versionNumber);
  const historicalResult = Boolean(
    activeResult && activeResult.sourceVersionNumber !== card.current.versionNumber,
  );

  const viewerBox = h("div", { class: "viewer" });

  main.append(
    h(
      "div",
      { class: "crumbs" },
      h("a", { href: "/pages/catalog.html" }, "Каталог"),
      ` / ${card.name}`,
    ),
    ...(activeResult && historicalResult
      ? [
          h(
            "div",
            { class: "note info" },
            `Открыта конвертация исходной версии v${activeResult.sourceVersionNumber}. Текущая исходная версия — v${card.current.versionNumber}.`,
          ),
        ]
      : []),
    h("div", { class: "model-top" }, viewerBox, buildInfoPanel(teamId, card, activeResult)),
    ...buildTabs(teamId, card, converted, activeResult),
  );

  const view = await getModelView(teamId, card.id);
  const resultView = activeResult
    ? {
        format: activeResult.format,
        mainUrl: `/api/teams/${teamId}/models/${card.id}/files/${activeResult.id}`,
        assets: [],
        archive: activeResult.name.toLowerCase().endsWith(".zip"),
      }
    : view;
  let closeViewer = await showViewer(viewerBox, resultView);

  if (activeResult) {
    const resultNumber = converted.length - converted.indexOf(activeResult);
    if (historicalResult) {
      viewerBox.append(
        h(
          "span",
          { class: "viewer-files historical-view-label" },
          `Результат №${resultNumber} · ${activeResult.format}`,
        ),
      );
    } else {
      const select = h(
        "select",
        { class: "viewer-files", "aria-label": "Какой файл показать" },
        h("option", { value: "" }, "Исходный файл"),
        h(
          "option",
          { value: String(activeResult.id) },
          `Результат №${resultNumber} · ${activeResult.format}`,
        ),
      ) as HTMLSelectElement;
      select.value = String(activeResult.id);
      const download = main.querySelector<HTMLAnchorElement>(".model-download")!;
      select.addEventListener("change", async () => {
        download.href = select.value
          ? fileDownloadUrl(teamId, card.id, activeResult.id)
          : versionDownloadUrl(teamId, card.id, card.current.versionId);
        download.textContent = select.value ? "Скачать результат" : "Скачать исходный";
        closeViewer();
        select.disabled = true;
        closeViewer = await showViewer(viewerBox, select.value ? resultView : view);
        select.disabled = false;
      });
      viewerBox.append(select);
    }
  }

  if (!card.current.hasPreview && card.canEdit) {
    createAndSavePreview(teamId, card.id);
  }
}

if (session.team === null) {
  showProblem(
    "Нет команды",
    "Модели хранятся в командах. Вернитесь в каталог, чтобы создать команду или принять приглашение.",
  );
} else if (!Number.isInteger(modelId) || modelId < 1) {
  showProblem("Модель не указана", "Откройте модель из каталога.");
} else {
  try {
    await showCard(session.team.teamId);
  } catch (error) {
    showProblem("Модель не найдена", errorText(error));
  }
}

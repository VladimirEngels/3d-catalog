import { createAndSavePreview, getCollections } from "@modules/catalog/index";
import { can, getSession } from "@shared/session";
import { dialogButton, openDialog } from "@shared/ui/dialog";
import { h } from "@shared/ui/dom";
import { createInput, errorText, field } from "@shared/ui/form";
import { formatBytes, formatDate, formatNumber } from "@shared/ui/format";
import { icon } from "@shared/ui/icons";
import { mountLayout, pageHead } from "@shared/ui/layout";
import { DuplicateModelError, uploadModel, type DuplicateModel } from "../api";
import "../upload.css";

const MAX_FILE_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["obj", "stl", "ply", "gltf", "glb", "zip"];

const main = await mountLayout("catalog");
const session = await getSession();

if (!can(session, "upload")) {
  location.href = "/pages/catalog.html";
  await new Promise(() => {});
}

const team = session.team!;
let selectedFile: File | null = null;


const fileInput = h("input", { type: "file", accept: ALLOWED_EXTENSIONS.map((extension) => `.${extension}`).join(","), hidden: "" }) as HTMLInputElement;
const chooseButton = h("button", { class: "btn link", type: "button" }, "выберите на компьютере");
const dropzone = h("div", { class: "dropzone" },
  h("b", {}, "Перетащите файл сюда"), " или ", chooseButton,
  h("div", { class: "hint" }, "OBJ, STL, PLY, glTF, GLB или ZIP · до 100 МБ"),
  h("div", { class: "hint" }, "Модель с материалами и текстурами загружайте ZIP-архивом"),
);
const fileRow = h("div", { class: "file-row" });
fileRow.hidden = true;

function getExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

function checkFile(file: File): string | null {
  if (!ALLOWED_EXTENSIONS.includes(getExtension(file.name))) {
    return "Этот формат не поддерживается";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "Файл больше 100 МБ";
  }
  if (file.size === 0) {
    return "Файл пустой";
  }
  return null;
}

function selectFile(file: File): void {
  const problem = checkFile(file);
  selectedFile = problem === null ? file : null;
  errorBox.textContent = "";

  const removeButton = h("button", { class: "btn link x", type: "button", "aria-label": "Убрать файл" }, "✕");
  removeButton.addEventListener("click", clearFile);

  const checks = problem === null
    ? h("div", { class: "checks" }, h("span", {}, `✓ Формат ${getExtension(file.name).toUpperCase()}`), h("span", {}, "✓ Размер в норме"))
    : h("div", { class: "checks bad" }, problem);

  fileRow.replaceChildren(
    h("div", { class: "file-info" },
      h("div", { class: "fname" }, file.name, h("span", { class: "muted" }, ` · ${formatBytes(file.size)}`)),
      checks,
    ),
    removeButton,
  );
  fileRow.hidden = false;

  if (problem === null && nameInput.value.trim() === "") {
    nameInput.value = nameFromFile(file.name);
  }
}

function clearFile(): void {
  selectedFile = null;
  fileInput.value = "";
  fileRow.hidden = true;
}

chooseButton.addEventListener("click", (event) => {
  event.stopPropagation();
  fileInput.click();
});
dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files.length > 0) {
    selectFile(fileInput.files[0]);
  }
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("drag-over");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag-over"));
dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("drag-over");
  const file = event.dataTransfer?.files[0];
  if (file) {
    selectFile(file);
  }
});


const nameInput = createInput({ type: "text", required: "", maxlength: "200" });
const descriptionInput = h("textarea", { maxlength: "5000", placeholder: "Для чего модель, особенности" }) as HTMLTextAreaElement;
const tagsInput = createInput({ type: "text", placeholder: "например: средневековье, броня" });
const collectionSelect = h("select", {}, h("option", { value: "" }, "Без коллекции")) as HTMLSelectElement;

const errorBox = h("div", { class: "err-text dup-error", role: "alert" });
const statusBox = h("div", { class: "upload-status", role: "status" });
statusBox.hidden = true;
const submitButton = h("button", { class: "btn primary", type: "submit" }, "Добавить в каталог") as HTMLButtonElement;

function showStatus(text: string, percent: number | null): void {
  const bar = percent === null ? null : h("div", { class: "progress" }, h("div", { style: `width:${percent}%` }));
  statusBox.replaceChildren(text, bar ?? "");
  statusBox.hidden = false;
}

function showDuplicateDialog(duplicate: DuplicateModel): void {
  const preview = duplicate.hasPreview
    ? h("img", { src: `/api/teams/${team.teamId}/models/${duplicate.id}/preview`, alt: "" })
    : icon("box");

  const content = h("div", {},
    h("p", {}, `Точно такой же файл уже добавлен в команду «${team.teamName}», поэтому второй раз он не сохраняется.`),
    h("div", { class: "dup" },
      h("div", { class: "preview" }, preview),
      h("div", { class: "dup-info" },
        h("div", { class: "tile-title" }, duplicate.name),
        h("div", { class: "tile-meta" }, h("span", { class: "badge" }, duplicate.format), `${formatNumber(duplicate.triangles)} треуг.`),
        h("div", { class: "tag" }, `Добавил(а) ${duplicate.authorName} · ${formatDate(duplicate.createdAt)}`),
      ),
    ),
  );

  const close = openDialog("Эта модель уже есть в каталоге", content, [
    dialogButton("Выбрать другой файл", "btn", () => {
      close();
      clearFile();
    }),
    dialogButton("Открыть карточку", "btn primary", () => {
      location.href = `/pages/model.html?id=${duplicate.id}`;
    }),
  ]);
}

const form = h("form", { class: "narrow" },
  h("div", { class: "method" },
    h("label", { class: "on" },
      h("input", { type: "radio", name: "method", checked: "" }),
      h("div", {}, "С компьютера", h("small", {}, "Файл модели или ZIP-архив с текстурами")),
    ),
    h("label", { class: "disabled" },
      h("input", { type: "radio", name: "method", disabled: "" }),
      h("div", {}, "По ссылке", h("small", {}, "С внешней платформы. Появится вместе с конвертером")),
    ),
  ),
  dropzone,
  fileInput,
  fileRow,
  field("Название", nameInput),
  field("Описание", descriptionInput, undefined, "необязательно"),
  field("Теги", tagsInput, "Часть тегов система поставит сама: например, «персонаж», если у модели есть скелет.", "через запятую, необязательно"),
  field("Коллекция", collectionSelect, undefined, "необязательно"),
  errorBox,
  statusBox,
  h("div", { class: "form-actions" },
    submitButton,
    h("a", { class: "btn", href: "/pages/catalog.html" }, "Отмена"),
  ),
);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.textContent = "";

  if (selectedFile === null) {
    errorBox.textContent = "Выберите файл модели";
    return;
  }

  submitButton.disabled = true;
  try {
    const result = await uploadModel(team.teamId, selectedFile, {
      name: nameInput.value,
      description: descriptionInput.value,
      tags: tagsInput.value,
      collectionId: collectionSelect.value,
    }, (percent) => {
      showStatus(percent < 100 ? `Загрузка файла: ${percent} %` : "Файл передан, система разбирает модель…", percent);
    });

    showStatus("Создаём картинку-превью…", null);
    await createAndSavePreview(team.teamId, result.modelId);
    location.href = "/pages/catalog.html";
  } catch (error) {
    statusBox.hidden = true;
    submitButton.disabled = false;
    if (error instanceof DuplicateModelError) {
      showDuplicateDialog(error.duplicate);
    } else {
      errorBox.textContent = errorText(error);
    }
  }
});

main.append(
  h("div", { class: "crumbs" }, h("a", { href: "/pages/catalog.html" }, "Каталог"), " / Добавить модель"),
  pageHead("Добавить модель", `в каталог команды «${team.teamName}»`),
  form,
);

try {
  for (const collection of await getCollections(team.teamId)) {
    collectionSelect.append(h("option", { value: String(collection.id) }, collection.name));
  }
} catch {
}

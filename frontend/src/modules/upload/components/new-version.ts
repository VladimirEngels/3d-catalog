
import { createAndSavePreview } from "@modules/catalog/index";
import { dialogButton, openDialog } from "@shared/ui/dialog";
import { h } from "@shared/ui/dom";
import { createInput, errorText, field } from "@shared/ui/form";
import { DuplicateModelError, uploadVersion } from "../api";

export function openNewVersionDialog(teamId: number, modelId: number): void {
  const fileInput = createInput({ type: "file", accept: ".obj,.stl,.ply,.gltf,.glb,.zip" });
  const commentInput = createInput({ type: "text", maxlength: "500", placeholder: "Что изменилось" });
  const errorBox = h("div", { class: "err-text", role: "alert" });
  const statusBox = h("div", { class: "hint", role: "status" });

  async function send(): Promise<void> {
    errorBox.textContent = "";
    const file = fileInput.files?.[0];
    if (!file) {
      errorBox.textContent = "Выберите файл модели";
      return;
    }

    sendButton.setAttribute("disabled", "");
    try {
      await uploadVersion(teamId, modelId, file, commentInput.value, (percent) => {
        statusBox.textContent = percent < 100 ? `Загрузка файла: ${percent} %` : "Система разбирает модель…";
      });
      statusBox.textContent = "Создаём картинку-превью…";
      await createAndSavePreview(teamId, modelId);
      location.hash = "versions";
      location.reload();
    } catch (error) {
      statusBox.textContent = "";
      sendButton.removeAttribute("disabled");
      if (error instanceof DuplicateModelError) {
        errorBox.textContent = `Точно такой же файл уже есть: модель «${error.duplicate.name}»`;
      } else {
        errorBox.textContent = errorText(error);
      }
    }
  }

  const content = h("div", {},
    h("p", {}, "Прежние версии сохранятся, и их можно будет скачать. Автоматические теги пересчитаются по новому файлу."),
    field("Файл модели", fileInput, "OBJ, STL, PLY, glTF, GLB или ZIP · до 100 МБ"),
    field("Комментарий", commentInput, undefined, "необязательно"),
    errorBox,
    statusBox,
  );

  const sendButton = dialogButton("Загрузить", "btn primary", send);
  const close = openDialog("Новая версия модели", content, [
    dialogButton("Отмена", "btn", () => close()),
    sendButton,
  ]);
}

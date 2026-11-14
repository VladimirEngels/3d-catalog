
import { dialogButton, openDialog } from "@shared/ui/dialog";
import { h } from "@shared/ui/dom";
import { createInput, errorText, field } from "@shared/ui/form";
import { updateModel, type ModelCard } from "../api";

export function openEditDialog(teamId: number, model: ModelCard): void {
  const description = h("textarea", { maxlength: "5000" }) as HTMLTextAreaElement;
  description.value = model.description ?? "";

  const manualTags = model.tags.filter((tag) => !tag.isAuto).map((tag) => tag.name);
  const tagsInput = createInput({ type: "text", value: manualTags.join(", ") });
  const errorBox = h("div", { class: "err-text", role: "alert" });

  async function save(): Promise<void> {
    errorBox.textContent = "";
    try {
      await updateModel(teamId, model.id, description.value, tagsInput.value.split(","));
      location.reload();
    } catch (error) {
      errorBox.textContent = errorText(error);
    }
  }

  const content = h("div", {},
    field("Описание", description),
    field("Теги", tagsInput, "Теги с пунктирной рамкой система ставит и убирает сама.", "через запятую"),
    errorBox,
  );
  const close = openDialog("Изменить модель", content, [
    dialogButton("Отмена", "btn", () => close()),
    dialogButton("Сохранить", "btn primary", save),
  ]);
}


import { dialogButton, openDialog } from "@shared/ui/dialog";
import { h } from "@shared/ui/dom";
import { createInput, errorText, field } from "@shared/ui/form";
import { addModelsToCollection, createCollection, getCollections } from "../api";

export function openNameDialog(title: string, buttonText: string, startValue: string, save: (name: string) => Promise<void>): void {
  const nameInput = createInput({ type: "text", maxlength: "100", value: startValue });
  const errorBox = h("div", { class: "err-text", role: "alert" });

  async function submit(): Promise<void> {
    errorBox.textContent = "";
    try {
      await save(nameInput.value);
      close();
    } catch (error) {
      errorBox.textContent = errorText(error);
    }
  }

  const form = h("form", {}, field("Название", nameInput), errorBox);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });

  const close = openDialog(title, form, [
    dialogButton("Отмена", "btn", () => close()),
    dialogButton(buttonText, "btn primary", submit),
  ]);
  nameInput.focus();
}

export async function openAddToCollectionDialog(teamId: number, modelIds: number[], onDone: () => void): Promise<void> {
  const collections = await getCollections(teamId);

  const NEW_COLLECTION = "new";
  const select = h("select", {}) as HTMLSelectElement;
  for (const collection of collections) {
    select.append(h("option", { value: String(collection.id) }, collection.name));
  }
  select.append(h("option", { value: NEW_COLLECTION }, "+ Новая коллекция"));

  const nameInput = createInput({ type: "text", maxlength: "100", placeholder: "Название новой коллекции" });
  const nameField = field("Название", nameInput);
  nameField.hidden = collections.length > 0;
  select.addEventListener("change", () => {
    nameField.hidden = select.value !== NEW_COLLECTION;
  });

  const errorBox = h("div", { class: "err-text", role: "alert" });

  async function save(): Promise<void> {
    errorBox.textContent = "";
    try {
      const id = select.value === NEW_COLLECTION
        ? (await createCollection(teamId, nameInput.value)).id
        : Number(select.value);
      await addModelsToCollection(teamId, id, modelIds);
      close();
      onDone();
    } catch (error) {
      errorBox.textContent = errorText(error);
    }
  }

  const text = modelIds.length === 1 ? "Одна модель может входить в несколько коллекций." : `Выбрано моделей: ${modelIds.length}.`;
  const content = h("div", {}, h("p", {}, text), field("Коллекция", select), nameField, errorBox);
  const close = openDialog("Добавить в коллекцию", content, [
    dialogButton("Отмена", "btn", () => close()),
    dialogButton("Добавить", "btn primary", save),
  ]);
}

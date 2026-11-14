import { can, getSession } from "@shared/session";
import { confirmAction, showMessage } from "@shared/ui/dialog";
import { h } from "@shared/ui/dom";
import { errorText } from "@shared/ui/form";
import { icon } from "@shared/ui/icons";
import { mountLayout, pageHead } from "@shared/ui/layout";
import { createCollection, deleteCollection, getCollections, previewUrl, renameCollection, type Collection } from "../api";
import { openNameDialog } from "../components/collection-dialogs";
import "../catalog.css";

const main = await mountLayout("collections");
const session = await getSession();

if (session.team === null) {
  location.href = "/pages/catalog.html";
  await new Promise(() => {});
}

const teamId = session.team!.teamId;
const canManage = can(session, "collections");
const list = h("div", {});

function modelsText(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) {
    return `${count} моделей`;
  }
  if (last === 1) {
    return `${count} модель`;
  }
  return last >= 2 && last <= 4 ? `${count} модели` : `${count} моделей`;
}

function buildMosaic(collection: Collection): HTMLElement {
  const cells: HTMLElement[] = [];
  for (let i = 0; i < 4; i++) {
    const modelId = collection.previewModels[i];
    cells.push(h("div", { class: "preview" }, modelId ? h("img", { src: previewUrl(teamId, modelId), alt: "", loading: "lazy" }) : null));
  }
  return h("div", { class: "mosaic" }, ...cells);
}

function buildCard(collection: Collection): HTMLElement {
  const link = h("a", { class: "coll-link", href: `/pages/catalog.html?collection=${collection.id}` },
    buildMosaic(collection),
  );
  const body = h("div", { class: "coll-body" },
    h("a", { class: "coll-text", href: `/pages/catalog.html?collection=${collection.id}` },
      h("div", { class: "tile-title", title: collection.name }, collection.name),
      h("div", { class: "tag" }, modelsText(collection.modelCount)),
    ),
  );

  if (canManage) {
    const renameButton = h("button", { class: "btn link", type: "button" }, "Переименовать");
    renameButton.addEventListener("click", () => {
      openNameDialog("Переименовать коллекцию", "Сохранить", collection.name, async (name) => {
        await renameCollection(teamId, collection.id, name);
        await load();
      });
    });

    const deleteButton = h("button", { class: "btn link danger-button", type: "button" }, "Удалить");
    deleteButton.addEventListener("click", async () => {
      const agreed = await confirmAction(`Удалить коллекцию «${collection.name}»?`, "Модели не удалятся: они останутся в каталоге.", "Удалить");
      if (!agreed) {
        return;
      }
      try {
        await deleteCollection(teamId, collection.id);
        await load();
      } catch (error) {
        showMessage("Не удалось удалить коллекцию", errorText(error));
      }
    });
    body.append(h("div", { class: "coll-actions" }, renameButton, deleteButton));
  }
  return h("div", { class: "coll" }, link, body);
}

async function load(): Promise<void> {
  try {
    const collections = await getCollections(teamId);
    subtitle.textContent = `коллекций: ${collections.length}`;
    if (collections.length === 0) {
      const text = canManage ? "Создайте коллекцию, чтобы собрать модели в подборку: например, для одного уровня игры." : "Когда участники создадут коллекции, они появятся здесь.";
      list.replaceChildren(h("div", { class: "empty-box" }, h("b", {}, "Коллекций пока нет"), text));
    } else {
      list.replaceChildren(h("div", { class: "coll-grid" }, ...collections.map(buildCard)));
    }
  } catch (error) {
    list.replaceChildren(h("div", { class: "empty-box" }, h("b", {}, "Не удалось загрузить коллекции"), errorText(error)));
  }
}

const head = pageHead("Коллекции");
const subtitle = h("span", { class: "sub" });
head.append(subtitle);
if (canManage) {
  const createButton = h("button", { class: "btn primary", type: "button" }, icon("plus"), "Создать коллекцию");
  createButton.addEventListener("click", () => {
    openNameDialog("Новая коллекция", "Создать", "", async (name) => {
      await createCollection(teamId, name);
      await load();
    });
  });
  head.append(h("div", { class: "actions" }, createButton));
}

main.append(head, list);
await load();

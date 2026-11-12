import { getModel } from "../api";
import { mountMenu } from "../../../shared/ui/layout";

const params = new URLSearchParams(location.search);
const id = Number(params.get("id"));

function setText(elementId: string, text: string): void {
  const element = document.getElementById(elementId) as HTMLElement;
  element.textContent = text;
}

async function start(): Promise<void> {

  mountMenu("catalog");

  const item = await getModel(id);

  if (item === undefined) {
    (document.getElementById("model") as HTMLElement).hidden = true;
    (document.getElementById("not-found") as HTMLElement).hidden = false;
    setText("crumb-name", "нет модели");
    return;
  }

  const model = item.model;
  const version = item.version;

  document.title = `${model.name} — 3D-Каталог`;
  setText("crumb-name", model.name);
  setText("name", model.name);
  setText("description", model.description ?? "Описания нет");
  setText("preview", item.formats.join(" · "));
  setText("formats", item.formats.join(", "));
  setText("triangles", version.triangles_count.toLocaleString("ru-RU"));
  setText("vertices", version.vertices_count.toLocaleString("ru-RU"));
  setText("skeleton", version.has_skeleton ? "есть" : "нет");
  setText("size", `${version.size_x} × ${version.size_y} × ${version.size_z} м`);
  setText("version", String(version.version_number));
  setText("created", new Date(model.created_at).toLocaleDateString("ru-RU"));
}

start();

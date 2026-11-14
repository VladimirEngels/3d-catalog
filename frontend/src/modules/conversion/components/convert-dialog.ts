
import { dialogButton, openDialog, showMessage } from "@shared/ui/dialog";
import { h } from "@shared/ui/dom";
import { errorText } from "@shared/ui/form";
import { createConversions, type TargetFormat } from "../api";
import "../conversion.css";

export interface ModelToConvert {
  id: number;
  name: string;
  format: string;
  hasSkeleton: boolean;
  hasTextures: boolean;
}

const FORMATS: TargetFormat[] = ["OBJ", "GLB", "STL", "PLY"];
const FORMATS_WITH_TEXTURES: TargetFormat[] = ["OBJ", "GLB"];

function describeLosses(models: ModelToConvert[], target: TargetFormat): string[] {
  const withSkeleton = models.filter((model) => model.hasSkeleton).length;
  const withTextures = models.filter((model) => model.hasTextures).length;
  const losses: string[] = [];

  if (target !== "GLB" && withSkeleton > 0) {
    losses.push(`${target} не сохраняет скелет и анимации. Со скелетом моделей: ${withSkeleton}.`);
  }
  if ((target === "STL" || target === "PLY") && withTextures > 0) {
    losses.push(`${target} не сохраняет текстуры и материалы. С текстурами моделей: ${withTextures}.`);
  }
  return losses;
}

export function openConvertDialog(teamId: number, models: ModelToConvert[]): void {
  let target: TargetFormat = FORMATS.find((format) => models.some((model) => model.format !== format)) ?? "OBJ";

  const lossBox = h("div", {});
  const errorBox = h("div", { class: "err-text", role: "alert" });
  const upscaleInput = h("input", { type: "checkbox" }) as HTMLInputElement;
  const upscaleHint = h("span", { class: "hint upscale-hint" });
  const formatLabels = new Map<TargetFormat, HTMLElement>();

  function refresh(): void {
    for (const [format, label] of formatLabels) {
      label.classList.toggle("on", format === target);
    }

    const losses = describeLosses(models, target);
    lossBox.replaceChildren(...losses.map((text) => h("div", { class: "note warn" }, text)));

    const canUpscale = FORMATS_WITH_TEXTURES.includes(target) && models.some((model) => model.hasTextures);
    upscaleInput.disabled = !canUpscale;
    if (!canUpscale) {
      upscaleInput.checked = false;
    }
    upscaleHint.textContent = canUpscale
      ? "Разрешение вырастет в 4 раза, например с 256×256 до 1024×1024. Исходные текстуры сохранятся."
      : "Доступно для моделей с текстурами при переводе в OBJ или GLB.";
  }

  const formats = h("div", { class: "formats" });
  for (const format of FORMATS) {
    const input = h("input", { type: "radio", name: "target-format", value: format }) as HTMLInputElement;
    input.checked = format === target;
    input.addEventListener("change", () => {
      target = format;
      refresh();
    });
    const label = h("label", {}, input, format);
    formatLabels.set(format, label);
    formats.append(label);
  }
  refresh();

  async function start(): Promise<void> {
    errorBox.textContent = "";
    try {
      const result = await createConversions(teamId, models.map((model) => model.id), target, upscaleInput.checked);
      close();
      if (result.created.length > 0 && result.skipped.length === 0) {
        location.href = "/pages/jobs.html";
        return;
      }
      const skipped = result.skipped.map((item) => `«${item.name}»: ${item.reason}`).join("; ");
      showMessage(`Заданий создано: ${result.created.length}`, `Пропущено — ${skipped}.`);
    } catch (error) {
      errorBox.textContent = errorText(error);
    }
  }

  const names = models.slice(0, 3).map((model) => model.name).join(" · ");
  const more = models.length > 3 ? ` и ещё ${models.length - 3}` : "";

  const content = h("div", {},
    h("p", {}, names + more),
    h("div", { class: "field" }, h("span", {}, "В какой формат")),
    formats,
    lossBox,
    h("label", { class: "check" }, upscaleInput, h("span", {}, "Улучшить текстуры нейросетью", upscaleHint)),
    h("div", { class: "demo-note" }, "Конвертер пока не подключён: задание будет создано и останется в очереди."),
    errorBox,
  );

  const title = models.length === 1 ? "Перевести модель" : `Перевести модели: ${models.length}`;
  const close = openDialog(title, content, [
    dialogButton("Отмена", "btn", () => close()),
    dialogButton("Запустить перевод", "btn primary", start),
  ]);
}

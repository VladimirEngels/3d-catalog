import { getSession } from "@shared/session";
import { changeSetting, readSettings, resetSettings, type Colors, type SiteSettings } from "@shared/settings";
import { h } from "@shared/ui/dom";
import { mountLayout, pageHead } from "@shared/ui/layout";
import "../accounts.css";

const session = await getSession();
const main = await mountLayout("", session.user.isAdmin ? "admin" : "team");

interface Choice<T> {
  value: T;
  label: string;
  note?: string;
}

function buildChoices<K extends keyof SiteSettings>(name: K, title: string, hint: string, choices: Choice<SiteSettings[K]>[]): HTMLElement {
  const labels: HTMLElement[] = [];

  const options = choices.map((choice) => {
    const input = h("input", { type: "radio", name, value: String(choice.value) }) as HTMLInputElement;
    input.checked = readSettings()[name] === choice.value;

    const label = h("label", { class: input.checked ? "choice on" : "choice" },
      input,
      h("span", {}, choice.label, choice.note ? h("small", {}, choice.note) : null),
    );
    labels.push(label);

    input.addEventListener("change", () => {
      changeSetting(name, choice.value);
      for (const item of labels) {
        item.classList.toggle("on", item === label);
      }
    });
    return label;
  });

  return h("fieldset", { class: "setting" },
    h("legend", {}, title),
    h("div", { class: "hint" }, hint),
    h("div", { class: "choices" }, ...options),
  );
}

const paletteNames: Record<string, string> = {
  forest: "Лес",
  ocean: "Море",
  graphite: "Графит",
  plum: "Слива",
  rust: "Ржавчина",
};

function swatches(colors: Colors): HTMLElement {
  return h("span", { class: "swatches" },
    ...[colors.menu, colors.accent, colors.highlight].map((color) => h("i", { style: `background:${color}` })),
  );
}

function buildPalette(): HTMLElement {
  const labels: HTMLElement[] = [];
  const custom = { ...readSettings().customColors };

  const pickers = h("div", { class: "color-pickers" });
  const customSwatches = swatches(custom);

  const fields: [keyof Colors, string][] = [
    ["menu", "Меню"],
    ["accent", "Акцент (кнопки, ссылки)"],
    ["highlight", "Выбранный пункт и тёмная тема"],
  ];
  fields.forEach(([key, title], index) => {
    const input = h("input", { type: "color", value: custom[key] }) as HTMLInputElement;
    input.addEventListener("input", () => {
      custom[key] = input.value;
      changeSetting("customColors", { ...custom });
      (customSwatches.children[index] as HTMLElement).style.background = input.value;
    });
    pickers.append(h("label", { class: "color-field" }, input, h("span", {}, title)));
  });

  const variants = [
    ...Object.entries(window.siteSettings.palettes).map(([name, colors]) => ({ name, label: paletteNames[name] ?? name, mark: swatches(colors) })),
    { name: "custom", label: "Свои", mark: customSwatches },
  ];

  const options = variants.map((variant) => {
    const input = h("input", { type: "radio", name: "palette", value: variant.name }) as HTMLInputElement;
    input.checked = readSettings().palette === variant.name;

    const label = h("label", { class: input.checked ? "choice on" : "choice" }, input, variant.mark, h("span", {}, variant.label));
    labels.push(label);

    input.addEventListener("change", () => {
      changeSetting("palette", variant.name);
      for (const item of labels) item.classList.toggle("on", item === label);
      pickers.hidden = variant.name !== "custom";
    });
    return label;
  });

  pickers.hidden = readSettings().palette !== "custom";

  return h("fieldset", { class: "setting" },
    h("legend", {}, "Цвета"),
    h("div", { class: "hint" }, "Готовый набор или свои цвета. Цвета состояний (готово, ошибка) не меняются."),
    h("div", { class: "choices" }, ...options),
    pickers,
  );
}

const resetButton = h("button", { class: "btn", type: "button" }, "Вернуть настройки по умолчанию");
resetButton.addEventListener("click", () => {
  resetSettings();
  location.reload();
});

main.append(
  pageHead("Настройки", "внешний вид сайта в этом браузере"),
  h("div", { class: "panel settings-panel" },
    buildChoices("theme", "Тема", "3D-окно и превью моделей остаются на тёмном фоне при любой теме.", [
      { value: "light", label: "Светлая" },
      { value: "dark", label: "Тёмная" },
      { value: "system", label: "Как в системе" },
    ]),
    buildPalette(),
    buildChoices("scale", "Масштаб", "Размер всего на странице.", [
      { value: 90, label: "90 %" },
      { value: 100, label: "100 %" },
      { value: 110, label: "110 %" },
      { value: 125, label: "125 %" },
    ]),
    buildChoices("menu", "Положение меню", "С какой стороны экрана находятся меню и фильтры каталога.", [
      { value: "right", label: "Справа" },
      { value: "left", label: "Слева" },
    ]),
    buildChoices("tiles", "Размер плиток каталога", "Мелкие плитки помещают больше моделей на экран, крупные лучше показывают превью.", [
      { value: "small", label: "Мелкие" },
      { value: "medium", label: "Средние" },
      { value: "large", label: "Крупные" },
    ]),
    buildChoices("catalogView", "Вид каталога", "Как открывается каталог. Этот выбор запоминается и при переключении в самом каталоге.", [
      { value: "grid", label: "Плитки" },
      { value: "table", label: "Таблица" },
    ]),
    buildChoices("motion", "Анимация", "Без анимации интерфейс спокойнее, например полоска выполнения задания не движется.", [
      { value: "on", label: "Включена" },
      { value: "off", label: "Выключена" },
    ]),
    h("div", { class: "settings-footer" },
      resetButton,
      h("div", { class: "hint" }, "Настройки хранятся только в этом браузере: на другом компьютере они будут обычными."),
    ),
  ),
);

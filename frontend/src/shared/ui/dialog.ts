
import { h } from "./dom";

export function openDialog(title: string, content: HTMLElement, buttons: HTMLElement[]): () => void {
  const dialog = h("div", { class: "dialog", role: "dialog", "aria-modal": "true" },
    h("h2", {}, title),
    content,
    h("div", { class: "form-actions" }, ...buttons),
  );
  const overlay = h("div", { class: "overlay" }, dialog);

  function close(): void {
    overlay.remove();
    document.removeEventListener("keydown", closeOnEscape);
  }

  function closeOnEscape(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      close();
    }
  }

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      close();
    }
  });
  document.addEventListener("keydown", closeOnEscape);

  document.body.append(overlay);
  return close;
}

export function dialogButton(text: string, className: string, onClick: () => void): HTMLElement {
  const button = h("button", { class: className, type: "button" }, text);
  button.addEventListener("click", onClick);
  return button;
}

export function showMessage(title: string, text: string): void {
  const close = openDialog(title, h("p", {}, text), [
    dialogButton("Понятно", "btn primary", () => close()),
  ]);
}

export function confirmAction(title: string, text: string, buttonText: string): Promise<boolean> {
  return new Promise((resolve) => {
    const close = openDialog(title, h("p", {}, text), [
      dialogButton("Отмена", "btn", () => {
        close();
        resolve(false);
      }),
      dialogButton(buttonText, "btn primary", () => {
        close();
        resolve(true);
      }),
    ]);
  });
}

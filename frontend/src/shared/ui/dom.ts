
export function h(
  tag: string,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null)[]
): HTMLElement {
  const element = document.createElement(tag);

  for (const name in attrs) {
    element.setAttribute(name, attrs[name]);
  }

  for (const child of children) {
    if (child !== null) {
      element.append(child);
    }
  }

  return element;
}

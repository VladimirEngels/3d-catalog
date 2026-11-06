export function h(tag: string, className: string, ...children: (Node | string)[]): HTMLElement {
  const element = document.createElement(tag);   
  if (className !== "") {
    element.className = className;               
  }
  element.append(...children);                  
  return element;
}

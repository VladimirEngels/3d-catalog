
import { getScale } from "@shared/settings";
import { h } from "./dom";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const MAX_BAR_WIDTH = 24;
const CORNER = 0;

function svgElement(tag: string, attrs: Record<string, string | number>): SVGElement {
  const element = document.createElementNS(SVG_NAMESPACE, tag);
  for (const name in attrs) {
    element.setAttribute(name, String(attrs[name]));
  }
  return element;
}

function svgText(text: string, attrs: Record<string, string | number>): SVGElement {
  const element = svgElement("text", attrs);
  element.textContent = text;
  return element;
}

function addTooltip(target: SVGElement, text: string): void {
  let tip: HTMLElement | null = null;
  target.addEventListener("mousemove", (event) => {
    const mouse = event as MouseEvent;
    if (tip === null) {
      tip = h("div", { class: "chart-tip" }, text);
      document.body.append(tip);
    }
    const scale = getScale();
    tip.style.left = `${mouse.clientX / scale + 12}px`;
    tip.style.top = `${mouse.clientY / scale - 28}px`;
  });
  target.addEventListener("mouseleave", () => {
    tip?.remove();
    tip = null;
  });
}

function roundUp(value: number): number {
  if (value <= 2) {
    return 2;
  }
  const scale = 10 ** Math.floor(Math.log10(value));
  const rounded = Math.ceil(value / scale) * scale;
  return rounded % 2 === 0 ? rounded : rounded + scale;
}

function columnPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(CORNER, height, width / 2);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

function barPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(CORNER, width, height / 2);
  return `M${x},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height - r}Q${x + width},${y + height} ${x + width - r},${y + height}H${x}Z`;
}

export function drawColumns(container: HTMLElement, labels: string[], values: number[], unit: string): void {
  const width = container.clientWidth;
  const height = 200;
  const left = 32;
  const bottom = 22;
  const top = 10;
  const plotHeight = height - top - bottom;
  const slot = (width - left) / values.length;
  const barWidth = Math.min(MAX_BAR_WIDTH, slot * 0.6);
  const maximum = roundUp(Math.max(...values, 1));
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, height, role: "img" });

  for (const tick of [0, maximum / 2, maximum]) {
    const y = top + plotHeight - (tick / maximum) * plotHeight;
    svg.append(
      svgElement("line", { class: "grid-line", x1: left, x2: width, y1: y, y2: y }),
      svgText(String(tick), { class: "axis-text", x: left - 6, y: y + 4, "text-anchor": "end" }),
    );
  }

  const labelStep = Math.ceil(values.length / 10);

  values.forEach((value, index) => {
    const barHeight = (value / maximum) * plotHeight;
    const x = left + index * slot + (slot - barWidth) / 2;
    const y = top + plotHeight - barHeight;

    const hit = svgElement("rect", { class: "hit", x: left + index * slot, y: top, width: slot, height: plotHeight });
    addTooltip(hit, `${labels[index]} · ${unit}: ${value}`);
    svg.append(hit);

    if (value > 0) {
      svg.append(svgElement("path", { class: "bar", d: columnPath(x, y, barWidth, barHeight) }));
    }
    if (index % labelStep === 0) {
      svg.append(svgText(labels[index], { class: "axis-text", x: x + barWidth / 2, y: height - 6, "text-anchor": "middle" }));
    }
  });

  container.replaceChildren(svg);
}

export function drawBars(container: HTMLElement, labels: string[], values: number[], unit: string): void {
  const width = container.clientWidth;
  const rowHeight = 34;
  const barHeight = 14;
  const labelWidth = Math.min(190, width * 0.4);
  const valueWidth = 44;
  const maximum = Math.max(...values, 1);
  const height = rowHeight * values.length;
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, height, role: "img" });

  const maxLetters = Math.floor(labelWidth / 6.2);

  values.forEach((value, index) => {
    const y = index * rowHeight;
    const barWidth = Math.max(2, (value / maximum) * (width - labelWidth - valueWidth));
    const label = labels[index].length > maxLetters ? `${labels[index].slice(0, maxLetters - 1)}…` : labels[index];

    svg.append(svgText(label, { class: "axis-text", x: 0, y: y + rowHeight / 2 + 4 }));

    const hit = svgElement("rect", { class: "hit", x: 0, y, width, height: rowHeight });
    addTooltip(hit, `${labels[index]} · ${unit}: ${value}`);
    svg.append(
      hit,
      svgElement("path", { class: "bar", d: barPath(labelWidth, y + (rowHeight - barHeight) / 2, barWidth, barHeight) }),
      svgText(String(value), { class: "value-text", x: labelWidth + barWidth + 8, y: y + rowHeight / 2 + 4 }),
    );
  });

  container.replaceChildren(svg);
}

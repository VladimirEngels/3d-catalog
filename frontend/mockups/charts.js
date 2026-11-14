
const SVG = "http://www.w3.org/2000/svg";

function el(name, attrs) {
  const node = document.createElementNS(SVG, name);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  return node;
}

function barPath(x, y, w, h, vertical) {
  const r = Math.min(4, vertical ? h : w, (vertical ? w : h) / 2);
  if (vertical)
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
}

const tip = document.createElement("div");
tip.className = "chart-tip"; tip.hidden = true;
document.addEventListener("DOMContentLoaded", () => document.body.appendChild(tip));
function hover(target, text) {
  target.addEventListener("mousemove", e => { tip.hidden = false; tip.textContent = text; tip.style.left = e.clientX + 12 + "px"; tip.style.top = e.clientY - 28 + "px"; });
  target.addEventListener("mouseleave", () => { tip.hidden = true; });
}

function columns(container, labels, values, unit) {
  const W = container.clientWidth, H = 200, left = 28, bottom = 22, top = 16;
  const max = Math.ceil(Math.max(...values) / 10) * 10;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, height: H });
  const plotH = H - bottom - top, slot = (W - left) / values.length;
  const barW = Math.min(24, slot * 0.6);

  for (const t of [0, max / 2, max]) {
    const y = top + plotH - (t / max) * plotH;
    svg.append(el("line", { class: "grid-line", x1: left, x2: W, y1: y, y2: y }));
    const txt = el("text", { class: "axis-text", x: left - 6, y: y + 4, "text-anchor": "end" }); txt.textContent = t; svg.append(txt);
  }
  values.forEach((v, i) => {
    const h = (v / max) * plotH, x = left + i * slot + (slot - barW) / 2, y = top + plotH - h;
    const hit = el("rect", { class: "hit", x: left + i * slot, y: top, width: slot, height: plotH });
    hover(hit, `${labels[i]}: ${v} ${unit}`);
    svg.append(hit, el("path", { class: "bar", d: barPath(x, y, barW, h, true) }));
    if (i % 2 === 0) {
      const t = el("text", { class: "axis-text", x: x + barW / 2, y: H - 6, "text-anchor": "middle" }); t.textContent = labels[i]; svg.append(t);
    }
  });
  container.append(svg);
}

function bars(container, labels, values, unit) {
  const W = container.clientWidth, row = 34, labelW = 170, valueW = 40;
  const H = row * values.length, max = Math.max(...values);
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, height: H });
  values.forEach((v, i) => {
    const y = i * row, w = (v / max) * (W - labelW - valueW), barH = 14;
    const name = el("text", { class: "axis-text", x: 0, y: y + row / 2 + 4 }); name.textContent = labels[i];
    const hit = el("rect", { class: "hit", x: 0, y, width: W, height: row });
    hover(hit, `${labels[i]}: ${v} ${unit}`);
    const val = el("text", { class: "value-text", x: labelW + w + 8, y: y + row / 2 + 4 }); val.textContent = v;
    svg.append(name, hit, el("path", { class: "bar", d: barPath(labelW, y + (row - barH) / 2, w, barH, false) }), val);
  });
  container.append(svg);
}

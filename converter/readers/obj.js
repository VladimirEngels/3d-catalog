import { prepareGeometries, triangulateFace } from "../core/geometry.js";
import { materialWarning, splitNames } from "./mtl.js";

export function readObj(data) {
  const positions = [];
  const textures = [];
  const normals = [];
  const faces = [];
  const losses = new Set();
  const libraries = new Set();
  let materialName = null;
  for (const raw of data
    .toString("utf8")
    .replace(/\\\r?\n/g, " ")
    .split(/\r?\n/)) {
    const line = raw.split("#", 1)[0].trim();
    const [command, ...parts] = line.split(/\s+/);
    if (!command) continue;
    if (command === "v") {
      if (![3, 4, 6, 7].includes(parts.length)) throw new Error("Неверная вершина OBJ");
      const values = numbers(parts);
      const weight = values.length === 4 ? values[3] : 1;
      if (weight === 0) throw new Error("Нулевой вес координат вершины OBJ");
      positions.push(values.slice(0, 3).map((value) => value / weight));
      if (values.length > 4) losses.add("Цвета отдельных вершин OBJ пока не переносятся");
    } else if (command === "vt") {
      if (parts.length < 1 || parts.length > 3) throw new Error("Неверные UV-координаты OBJ");
      const values = numbers(parts);
      textures.push([values[0], 1 - (values[1] ?? 0)]);
      if (values.length === 3) losses.add("Третья текстурная координата OBJ не переносится");
    } else if (command === "vn") {
      if (parts.length !== 3) throw new Error("Неверная нормаль OBJ");
      normals.push(numbers(parts));
    } else if (command === "f") {
      faces.push({
        parts,
        counts: [positions.length, textures.length, normals.length],
        materialName,
      });
    } else if (command === "mtllib") {
      const names = splitNames(line.slice(command.length).trim());
      if (!names.length) throw new Error("В OBJ не указан файл MTL");
      for (const name of names) libraries.add(name);
      losses.add(materialWarning);
    } else if (command === "usemtl") {
      materialName = line.slice(command.length).trim();
      if (!materialName) throw new Error("В OBJ не указано имя материала");
      losses.add(materialWarning);
    } else if (command === "o" || command === "g") {
      losses.add("Имена объектов и групп OBJ не переносятся");
    } else if (command === "s") {
      if (parts[0] !== "off" && parts[0] !== "0")
        losses.add("Группы сглаживания OBJ не переносятся; заданные нормали сохраняются");
    } else {
      throw new Error(`Неподдерживаемая запись OBJ: ${command}`);
    }
  }
  const groups = new Map();
  for (const face of faces) {
    const references = face.parts.map((part) => {
      const fields = part.split("/");
      if (fields.length > 3 || !fields[0]) throw new Error("Неверный угол грани OBJ");
      return fields.map((field, i) =>
        field ? reference(field, face.counts[i], [positions, textures, normals][i].length) : null,
      );
    });
    if (references.length < 3) throw new Error("Грань OBJ содержит меньше трёх вершин");
    const uv = references[0][1] != null;
    const normal = references[0][2] != null;
    if (references.some((ref) => (ref[1] != null) !== uv || (ref[2] != null) !== normal))
      throw new Error("Углы грани OBJ имеют несогласованные UV или нормали");
    const key = JSON.stringify([face.materialName, uv, normal]);
    if (!groups.has(key))
      groups.set(key, {
        geometry: {
          vertices: [],
          faces: [],
          ...(face.materialName ? { materialName: face.materialName } : {}),
          ...(uv ? { uvs: [] } : {}),
          ...(normal ? { normals: [] } : {}),
        },
        indices: new Map(),
      });
    const { geometry, indices } = groups.get(key);
    const corners = references.map((ref) => {
      const tuple = ref.join("/");
      if (!indices.has(tuple)) {
        geometry.vertices.push(positions[ref[0] - 1]);
        if (uv) geometry.uvs.push(textures[ref[1] - 1]);
        if (normal) geometry.normals.push(normals[ref[2] - 1]);
        indices.set(tuple, geometry.vertices.length);
      }
      return indices.get(tuple);
    });
    geometry.faces.push(...triangulateFace(corners, geometry.vertices));
  }
  if (!faces.length) throw new Error("В OBJ нет полигональной геометрии");
  return {
    geometries: prepareGeometries([...groups.values()].map((group) => group.geometry)),
    losses: [...losses],
    materialLibraries: [...libraries],
  };
}

function numbers(parts) {
  const values = parts.map(Number);
  if (values.some((value) => !Number.isFinite(value)))
    throw new Error("В OBJ содержатся неверные числа");
  return values;
}
function reference(text, count, total) {
  if (!/^[+-]?\d+$/.test(text)) throw new Error("Неверный индекс OBJ");
  const value = Number(text);
  const index = value < 0 ? count + value + 1 : value;
  if (
    !Number.isSafeInteger(value) ||
    value === 0 ||
    index < 1 ||
    index > (value < 0 ? count : total)
  )
    throw new Error("Индекс OBJ вне диапазона");
  return index;
}

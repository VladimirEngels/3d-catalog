import { prepareGeometries } from "../core/geometry.js";

export const materialWarning = "Материалы и текстуры из MTL пока не загружены";

export function splitNames(text) {
  const tokens = text.match(/"[^"\r\n]*"|'[^'\r\n]*'|\S+/g) ?? [];
  return tokens.map((token) => {
    if (token[0] === '"' || token[0] === "'") {
      if (token.at(-1) !== token[0]) throw new Error("Незакрытые кавычки в имени файла");
      return token.slice(1, -1);
    }
    return token;
  });
}

export async function loadObjMaterials(source, readResource) {
  const definitions = new Map();
  const loaded = new Map();
  const losses = new Set(source.losses.filter((loss) => loss !== materialWarning));
  for (const library of source.materialLibraries) {
    const file = await readResource(library);
    for (const [name, material] of parseMtl(file.bytes)) {
      if (definitions.has(name))
        losses.add(`Повторное определение материала «${name}»: используется последнее`);
      definitions.set(name, { ...material, path: file.path });
    }
  }
  const geometries = [];
  for (const geometry of source.geometries) {
    const name = geometry.materialName;
    if (!name) {
      geometries.push(geometry);
      continue;
    }
    if (!loaded.has(name)) {
      const material = definitions.get(name);
      if (!material) throw new Error(`Материал «${name}» не найден в MTL`);
      const properties = {
        color: { r: 1, g: 1, b: 1 },
        vertexColor: material.color,
        transparency: material.transparency,
      };
      if (material.texture)
        properties.textureBuf = (await readResource(material.texture, material.path)).bytes;
      for (const loss of material.losses) losses.add(`Материал «${name}»: ${loss}`);
      loaded.set(name, properties);
    }
    geometries.push({ ...geometry, ...loaded.get(name) });
  }
  return { geometries: prepareGeometries(geometries), losses: [...losses] };
}

function parseMtl(data) {
  const materials = new Map();
  let current;
  for (const raw of data
    .toString("utf8")
    .replace(/\\\r?\n/g, " ")
    .split(/\r?\n/)) {
    const line = raw.split("#", 1)[0].trim();
    if (!line) continue;
    const [, command, value = ""] = /^(\S+)(?:\s+(.*))?$/.exec(line);
    if (command === "newmtl") {
      if (!value) throw new Error("У материала MTL отсутствует имя");
      current = { color: { r: 1, g: 1, b: 1 }, transparency: 0, losses: new Set() };
      materials.set(value, current);
      continue;
    }
    if (!current) throw new Error("Свойство MTL указано до newmtl");
    if (command === "Kd") {
      const rgb = value.split(/\s+/).map(Number);
      if (
        rgb.length !== 3 ||
        rgb.some((number) => !Number.isFinite(number) || number < 0 || number > 1)
      )
        throw new Error("Неверный цвет Kd в MTL");
      current.color = { r: rgb[0], g: rgb[1], b: rgb[2] };
    } else if (command === "d" || command === "Tr") {
      const opacity = Number(value);
      if (!value || !Number.isFinite(opacity) || opacity < 0 || opacity > 1)
        throw new Error("Неверная прозрачность MTL");
      if (command === "d" || !current.hasD)
        current.transparency = command === "d" ? 1 - opacity : opacity;
      if (command === "d") current.hasD = true;
    } else if (command === "map_Kd") {
      const parts = splitNames(value);
      if (!parts.length || parts[0].startsWith("-"))
        throw new Error(
          "Параметры map_Kd пока не поддерживаются: укажите путь к картинке без опций",
        );
      current.texture = parts.join(" ");
    } else current.losses.add(`свойство ${command} не переносится`);
  }
  return materials;
}

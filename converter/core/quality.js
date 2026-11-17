import { bakeSkin } from "./matrix.js";

export function summarizeGeometry(geometries) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let vertices = 0;
  let triangles = 0;
  for (const original of geometries) {
    const geometry = original.skin ? bakeSkin(original) : original;
    vertices += geometry.vertices.length;
    triangles += geometry.faces.length;
    for (const vertex of geometry.vertices) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis], vertex[axis]);
        max[axis] = Math.max(max[axis], vertex[axis]);
      }
    }
  }
  return {
    vertices,
    triangles,
    meshes: geometries.length,
    size: max.map((value, axis) => value - min[axis]),
    min,
    max,
    hasUv: geometries.some((geometry) => geometry.uvs?.length > 0),
    hasTextures: geometries.some((geometry) => Boolean(geometry.textureBuf)),
    hasSkeleton: geometries.some((geometry) => Boolean(geometry.skin)),
  };
}

export function compareGeometry(before, after, losses) {
  const defects = [];
  if (before.triangles !== after.triangles) defects.push("Изменилось количество треугольников");
  const tolerance = Math.max(1, ...before.size) * 0.00001;
  if (
    before.min.some((value, axis) => Math.abs(value - after.min[axis]) > tolerance) ||
    before.max.some((value, axis) => Math.abs(value - after.max[axis]) > tolerance)
  ) {
    defects.push("Изменились границы геометрии в системе координат модели");
  }
  for (const [key, message] of [
    ["hasUv", "В результате отсутствуют UV-координаты"],
    ["hasTextures", "В результате отсутствует базовая текстура"],
    ["hasSkeleton", "В результате отсутствует скелет"],
  ]) {
    if (before[key] && !after[key] && !losses.includes(message)) losses = [...losses, message];
  }
  return { before, after, losses, defects, needsReview: losses.length > 0 || defects.length > 0 };
}

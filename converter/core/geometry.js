export function prepareGeometries(geometries) {
  if (!Array.isArray(geometries) || geometries.length === 0) {
    throw new Error("В модели нет геометрии");
  }
  return geometries.map((geo) => {
    if (
      !geo ||
      !Array.isArray(geo.vertices) ||
      !geo.vertices.length ||
      !Array.isArray(geo.faces) ||
      !geo.faces.length
    ) {
      throw new Error("В модели отсутствуют вершины или треугольники");
    }
    const count = geo.vertices.length;
    checkVectors(geo.vertices, 3, count, "координаты вершин");
    for (const face of geo.faces) {
      if (
        !Array.isArray(face) ||
        face.length !== 3 ||
        face.some((index) => !Number.isInteger(index) || index < 1 || index > count)
      ) {
        throw new Error("Грань ссылается на несуществующую вершину или не является треугольником");
      }
    }
    if (geo.uvs?.length) checkVectors(geo.uvs, 2, count, "текстурные координаты");
    if (geo.normals) checkVectors(geo.normals, 3, count, "нормали");
    if (geo.colors) {
      checkVectors(geo.colors, 4, count, "цвета вершин");
      if (geo.colors.some((color) => color.some((value) => value < 0 || value > 1)))
        throw new Error("Неверные цвета вершин");
    }
    if (geo.tangents) {
      checkVectors(geo.tangents, 4, count, "касательные");
      if (
        geo.tangents.some(
          (tangent) => !Math.hypot(...tangent.slice(0, 3)) || Math.abs(tangent[3]) !== 1,
        )
      )
        throw new Error("Неверные касательные");
    }
    if (
      geo.transparency !== undefined &&
      (!Number.isFinite(geo.transparency) || geo.transparency < 0 || geo.transparency > 1)
    ) {
      throw new Error("Неверная прозрачность материала");
    }
    for (const color of [geo.color, geo.vertexColor]) {
      if (
        color &&
        ![color.r, color.g, color.b].every(
          (value) => Number.isFinite(value) && value >= 0 && value <= 1,
        )
      ) {
        throw new Error("Неверный цвет материала");
      }
    }
    for (const image of [
      geo.textureBuf,
      geo.normalMapBuf,
      geo.metallicRoughnessBuf,
      geo.emissiveBuf,
      geo.occlusionBuf,
    ]) {
      if (image !== undefined && image !== null) {
        if (
          !Buffer.isBuffer(image) ||
          !(
            image.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ||
            (image[0] === 0xff && image[1] === 0xd8)
          )
        ) {
          throw new Error("Текстура должна быть PNG или JPEG");
        }
        if (!geo.uvs?.length) throw new Error("Для текстуры отсутствуют UV-координаты");
      }
    }
    if (geo.instanceMatrix) checkVectors([geo.instanceMatrix], 16, 1, "матрица детали");
    if (geo.skin) checkSkin(geo.skin, count);
    const normals = geo.normals?.map((normal) => {
      const length = Math.hypot(...normal);
      if (length === 0) throw new Error("Нормаль имеет нулевую длину");
      return normal.map((value) => value / length);
    });
    const skin = geo.skin
      ? {
          ...geo.skin,
          weights: geo.skin.weights.map((weights) => {
            const sum = weights.reduce((total, value) => total + value, 0);
            return weights.map((value) => value / sum);
          }),
        }
      : undefined;
    return { ...geo, uvs: geo.uvs ?? [], normals, skin };
  });
}

function checkVectors(vectors, width, count, name) {
  if (
    !Array.isArray(vectors) ||
    vectors.length !== count ||
    vectors.some(
      (vector) =>
        !Array.isArray(vector) ||
        vector.length !== width ||
        vector.some((value) => !Number.isFinite(value) || !Number.isFinite(Math.fround(value))),
    )
  ) {
    throw new Error(`Неверные ${name}`);
  }
}

function checkSkin(skin, count) {
  if (!Array.isArray(skin.bones) || !skin.bones.length || skin.bones.length > 65536)
    throw new Error("Неверный скелет модели");
  checkVectors(skin.joints, 4, count, "индексы костей");
  checkVectors(skin.weights, 4, count, "веса костей");
  for (let i = 0; i < count; i++) {
    if (
      skin.joints[i].some(
        (joint) => !Number.isInteger(joint) || joint < 0 || joint >= skin.bones.length,
      ) ||
      skin.weights[i].some((weight) => weight < 0) ||
      skin.weights[i].every((weight) => weight === 0)
    ) {
      throw new Error("Неверная привязка вершины к костям");
    }
  }
  if (!skin.bones.some((bone) => bone.parent === -1))
    throw new Error("У скелета отсутствует корневая кость");
  if (skin.inverseBindMatrices)
    checkVectors(skin.inverseBindMatrices, 16, skin.bones.length, "обратные матрицы привязки");
  for (const bone of skin.bones) {
    if (bone.matrix) checkVectors([bone.matrix], 16, 1, "матрица кости");
    else {
      checkVectors([bone.pos], 3, 1, "координаты кости");
      checkVectors([bone.rot], 9, 1, "матрица кости");
    }
    if (!Number.isInteger(bone.parent) || bone.parent < -1 || bone.parent >= skin.bones.length)
      throw new Error("Неверная родительская кость");
  }
  for (let i = 0; i < skin.bones.length; i++) {
    const visited = new Set();
    for (let parent = i; parent !== -1; parent = skin.bones[parent].parent) {
      if (visited.has(parent)) throw new Error("Скелет содержит цикл");
      visited.add(parent);
    }
  }
}

export function triangulateFace(indices, vertices) {
  if (
    indices.length < 3 ||
    indices.length > 1024 ||
    indices.some((index) => !Number.isInteger(index) || index < 1 || index > vertices.length)
  ) {
    throw new Error("Неверные индексы или размер грани");
  }
  if (indices.length === 3) return [indices];
  const points = indices.map((index) => vertices[index - 1]);
  const normal = [0, 0, 0];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    normal[0] += (a[1] - b[1]) * (a[2] + b[2]);
    normal[1] += (a[2] - b[2]) * (a[0] + b[0]);
    normal[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const axis = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
  const projected = points.map((point) => point.filter((_, i) => i !== axis));
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const area = projected.reduce((sum, a, i) => {
    const b = projected[(i + 1) % projected.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  if (area === 0) throw new Error("Не удалось разбить вырожденную грань на треугольники");
  const length = Math.hypot(...normal);
  const scale = Math.max(
    ...[0, 1, 2].map(
      (axis) =>
        Math.max(...points.map((point) => point[axis])) -
        Math.min(...points.map((point) => point[axis])),
    ),
  );
  if (
    points.some(
      (point) =>
        Math.abs(normal.reduce((sum, value, i) => sum + value * (point[i] - points[0][i]), 0)) /
          length >
        scale * 1e-6,
    )
  ) {
    throw new Error("Неплоскую грань нужно разбить на треугольники в исходной модели");
  }
  const onSegment = (a, b, p) =>
    cross(a, b, p) === 0 &&
    p.every((value, i) => value >= Math.min(a[i], b[i]) && value <= Math.max(a[i], b[i]));
  for (let i = 0; i < projected.length; i++)
    for (let j = i + 1; j < projected.length; j++) {
      if (j === i + 1 || (i === 0 && j === projected.length - 1)) continue;
      const a = projected[i];
      const b = projected[(i + 1) % projected.length];
      const c = projected[j];
      const d = projected[(j + 1) % projected.length];
      if (
        (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
        onSegment(a, b, c) ||
        onSegment(a, b, d) ||
        onSegment(c, d, a) ||
        onSegment(c, d, b)
      ) {
        throw new Error("Грань содержит самопересечение");
      }
    }
  const sign = Math.sign(area);
  const pending = indices.map((_, i) => i);
  const triangles = [];
  while (pending.length > 3) {
    let found = false;
    for (let i = 0; i < pending.length; i++) {
      const a = pending[(i + pending.length - 1) % pending.length];
      const b = pending[i];
      const c = pending[(i + 1) % pending.length];
      const A = projected[a];
      const B = projected[b];
      const C = projected[c];
      if (sign * cross(A, B, C) <= 0) continue;
      const contains = pending.some(
        (p) =>
          p !== a &&
          p !== b &&
          p !== c &&
          sign * cross(A, B, projected[p]) >= 0 &&
          sign * cross(B, C, projected[p]) >= 0 &&
          sign * cross(C, A, projected[p]) >= 0,
      );
      if (contains) continue;
      triangles.push([indices[a], indices[b], indices[c]]);
      pending.splice(i, 1);
      found = true;
      break;
    }
    if (!found) throw new Error("Не удалось разбить грань: проверьте её вершины и самопересечения");
  }
  triangles.push(pending.map((index) => indices[index]));
  return triangles;
}

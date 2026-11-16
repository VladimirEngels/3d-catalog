const TYPES = {
  5120: [1, "getInt8", 127],
  5121: [1, "getUint8", 255],
  5122: [2, "getInt16", 32767],
  5123: [2, "getUint16", 65535],
  5125: [4, "getUint32", 4294967295],
  5126: [4, "getFloat32"],
};
const WIDTHS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const integer = (value) => Number.isSafeInteger(value) && value >= 0;

export async function loadGltfData(data, readResource, isBinary) {
  let json;
  let binary;
  if (isBinary) {
    if (
      data.length < 20 ||
      data.toString("ascii", 0, 4) !== "glTF" ||
      data.readUInt32LE(4) !== 2 ||
      data.readUInt32LE(8) !== data.length
    )
      throw new Error("Повреждён заголовок GLB");
    let offset = 12;
    let chunk = 0;
    while (offset < data.length) {
      if (offset + 8 > data.length) throw new Error("Обрывается чанк GLB");
      const length = data.readUInt32LE(offset);
      const type = data.readUInt32LE(offset + 4);
      offset += 8;
      if (length % 4 || offset + length > data.length) throw new Error("Неверная длина чанка GLB");
      if (chunk === 0 && type !== 0x4e4f534a) throw new Error("Первый чанк GLB должен быть JSON");
      if (type === 0x4e4f534a) {
        if (json) throw new Error("Повторный JSON GLB");
        json = JSON.parse(data.toString("utf8", offset, offset + length));
      }
      if (type === 0x004e4942) {
        if (binary) throw new Error("Повторный BIN GLB");
        binary = data.subarray(offset, offset + length);
      }
      offset += length;
      chunk++;
    }
  } else json = JSON.parse(data.toString("utf8").replace(/^\uFEFF/, ""));
  if (json?.asset?.version !== "2.0") throw new Error("Поддерживается glTF 2.0");
  if (json.extensionsRequired?.length || json.extensionsUsed?.length)
    throw new Error(
      "Расширения glTF пока не поддерживаются: " +
        [...(json.extensionsRequired ?? []), ...(json.extensionsUsed ?? [])].join(", "),
    );
  const cache = new Map();
  const uri = async (value) => {
    if (typeof value !== "string") throw new Error("Неверный URI ресурса glTF");
    if (cache.has(value)) return cache.get(value);
    let bytes;
    if (value.startsWith("data:")) {
      const match = /^data:[^,]*;base64,([a-zA-Z0-9+/]*={0,2})$/.exec(value);
      if (!match || match[1].length % 4) throw new Error("Неверный встроенный ресурс glTF");
      bytes = Buffer.from(match[1], "base64");
    } else bytes = (await readResource(value)).bytes;
    cache.set(value, bytes);
    return bytes;
  };
  const buffers = [];
  for (const [i, buffer] of (json.buffers ?? []).entries()) {
    const bytes = buffer.uri === undefined && i === 0 ? binary : await uri(buffer.uri);
    if (!integer(buffer.byteLength) || !bytes || bytes.length < buffer.byteLength)
      throw new Error("Отсутствует или обрезан буфер glTF");
    buffers.push(bytes.subarray(0, buffer.byteLength));
  }
  const view = (index) => {
    const item = json.bufferViews?.[index];
    const buffer = buffers[item?.buffer];
    const offset = item?.byteOffset ?? 0;
    if (
      !integer(index) ||
      !item ||
      !buffer ||
      !integer(offset) ||
      !integer(item.byteLength) ||
      offset + item.byteLength > buffer.length
    )
      throw new Error("Неверный bufferView glTF");
    return { bytes: buffer.subarray(offset, offset + item.byteLength), stride: item.byteStride };
  };
  const accessor = (index, type, allowed) => {
    const item = json.accessors?.[index];
    if (
      !integer(index) ||
      !item ||
      item.type !== type ||
      !integer(item.count) ||
      item.count > 10000000 ||
      !TYPES[item.componentType] ||
      (allowed && !allowed.includes(item.componentType))
    )
      throw new Error("Неверный accessor glTF");
    const [size, method, max] = TYPES[item.componentType];
    const width = WIDTHS[item.type];
    if (!width || (item.type === "MAT4" && item.componentType !== 5126))
      throw new Error("Неподдерживаемый accessor glTF");
    const readValues = (bytes, offset, count, stride) => {
      if (
        !integer(offset) ||
        !integer(stride) ||
        stride < width * size ||
        stride % size ||
        offset % size ||
        (count && offset + (count - 1) * stride + width * size > bytes.length)
      )
        throw new Error("Accessor glTF выходит за буфер");
      const values = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return Array.from({ length: count }, (_, i) =>
        Array.from({ length: width }, (_, j) => {
          let value = values[method](offset + i * stride + j * size, true);
          if (!Number.isFinite(value)) throw new Error("В accessor glTF неверные числа");
          if (item.normalized && max) value = Math.max(-1, value / max);
          return value;
        }),
      );
    };
    let values;
    if (item.bufferView !== undefined) {
      const source = view(item.bufferView);
      values = readValues(
        source.bytes,
        item.byteOffset ?? 0,
        item.count,
        source.stride ?? width * size,
      );
    } else {
      if (!item.sparse) throw new Error("Accessor glTF без данных");
      values = Array.from({ length: item.count }, () => new Array(width).fill(0));
    }
    if (item.sparse) {
      const sparse = item.sparse;
      const indexType = TYPES[sparse.indices?.componentType];
      if (
        !integer(sparse.count) ||
        sparse.count > item.count ||
        ![5121, 5123, 5125].includes(sparse.indices?.componentType)
      )
        throw new Error("Неверный sparse glTF");
      const source = view(sparse.indices.bufferView).bytes;
      const start = sparse.indices.byteOffset ?? 0;
      const [indexSize, indexMethod] = indexType;
      if (!integer(start) || start + indexSize * sparse.count > source.length)
        throw new Error("Неверные индексы sparse glTF");
      const indices = new DataView(source.buffer, source.byteOffset, source.byteLength);
      const sparseValues = readValues(
        view(sparse.values.bufferView).bytes,
        sparse.values.byteOffset ?? 0,
        sparse.count,
        width * size,
      );
      let previous = -1;
      for (let i = 0; i < sparse.count; i++) {
        const target = indices[indexMethod](start + i * indexSize, true);
        if (target <= previous || target >= item.count)
          throw new Error("Индекс sparse glTF вне диапазона");
        values[target] = sparseValues[i];
        previous = target;
      }
    }
    return values;
  };
  return {
    json,
    accessor,
    image: async (index) => {
      const image = json.images?.[index];
      if (!integer(index) || !image) throw new Error("Текстура glTF не найдена");
      if (image.uri !== undefined) return uri(image.uri);
      return view(image.bufferView).bytes;
    },
  };
}

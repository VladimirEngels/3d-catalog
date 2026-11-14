
import { BoundingBox, ModelFileError, type ParsedModel } from "./types";

interface Property {
  name: string;
  type: string;
  listCountType?: string;
}

interface Element {
  name: string;
  count: number;
  properties: Property[];
}

const TYPE_SIZES: Record<string, number> = {
  char: 1, uchar: 1, int8: 1, uint8: 1,
  short: 2, ushort: 2, int16: 2, uint16: 2,
  int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4,
  double: 8, float64: 8,
};

type ReadNumber = (type: string) => number;

export function parsePly(data: Buffer): ParsedModel {
  const headerEnd = data.indexOf("end_header");
  if (data.toString("latin1", 0, 3) !== "ply" || headerEnd === -1) {
    throw new ModelFileError("Файл не похож на PLY: нет заголовка");
  }

  const { format, elements } = readHeader(data.toString("latin1", 0, headerEnd));
  const bodyStart = data.indexOf("\n", headerEnd) + 1;
  const read = format === "ascii" ? createTextReader(data, bodyStart) : createBinaryReader(data, bodyStart, format);

  const box = new BoundingBox();
  let vertices = 0;
  let triangles = 0;

  for (const element of elements) {
    if (element.name === "vertex") {
      vertices = element.count;
      readVertices(element, read, box);
    } else if (element.name === "face") {
      triangles = readFaces(element, read);
    } else {
      skipElement(element, read);
    }
  }

  return { triangles, vertices, hasSkeleton: false, size: box.getSize(), materials: [], textures: [], companions: [] };
}

function readHeader(text: string): { format: string; elements: Element[] } {
  let format = "";
  const elements: Element[] = [];

  for (const line of text.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === "format") {
      format = parts[1];
    } else if (parts[0] === "element") {
      const count = Number(parts[2]);
      if (!Number.isInteger(count) || count < 0) {
        throw new ModelFileError("В заголовке PLY неверное количество");
      }
      elements.push({ name: parts[1], count, properties: [] });
    } else if (parts[0] === "property" && elements.length > 0) {
      const current = elements[elements.length - 1];
      if (parts[1] === "list") {
        current.properties.push({ listCountType: parts[2], type: parts[3], name: parts[4] });
      } else {
        current.properties.push({ type: parts[1], name: parts[2] });
      }
    }
  }

  if (!["ascii", "binary_little_endian", "binary_big_endian"].includes(format)) {
    throw new ModelFileError("Неизвестный вариант формата PLY");
  }
  return { format, elements };
}

function readVertices(element: Element, read: ReadNumber, box: BoundingBox): void {
  for (let i = 0; i < element.count; i++) {
    const point: Record<string, number> = {};
    for (const property of element.properties) {
      point[property.name] = readProperty(property, read);
    }
    box.add(point.x, point.y, point.z);
  }
}

function readFaces(element: Element, read: ReadNumber): number {
  let triangles = 0;
  for (let i = 0; i < element.count; i++) {
    for (const property of element.properties) {
      const value = readProperty(property, read);
      if (property.listCountType && value >= 3) {
        triangles += value - 2;
      }
    }
  }
  return triangles;
}

function skipElement(element: Element, read: ReadNumber): void {
  for (let i = 0; i < element.count; i++) {
    for (const property of element.properties) {
      readProperty(property, read);
    }
  }
}

function readProperty(property: Property, read: ReadNumber): number {
  if (!property.listCountType) {
    return read(property.type);
  }
  const length = read(property.listCountType);
  for (let i = 0; i < length; i++) {
    read(property.type);
  }
  return length;
}

function createTextReader(data: Buffer, start: number): ReadNumber {
  let position = start;
  return () => {
    while (position < data.length && data[position] <= 32) position++;
    const tokenStart = position;
    while (position < data.length && data[position] > 32) position++;
    const value = Number(data.toString("latin1", tokenStart, position));
    if (tokenStart === position || !Number.isFinite(value)) {
      throw new ModelFileError("Файл PLY обрывается или содержит неверные числа");
    }
    return value;
  };
}

function createBinaryReader(data: Buffer, start: number, format: string): ReadNumber {
  const littleEndian = format === "binary_little_endian";
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let position = start;
  return (type) => {
    const size = TYPE_SIZES[type];
    if (!size) {
      throw new ModelFileError(`Неизвестный тип данных в файле PLY: ${type}`);
    }
    const value = readBinaryValue(view, position, type, littleEndian);
    position += size;
    return value;
  };
}

function readBinaryValue(view: DataView, position: number, type: string, littleEndian: boolean): number {
  switch (type) {
    case "char": case "int8": return view.getInt8(position);
    case "uchar": case "uint8": return view.getUint8(position);
    case "short": case "int16": return view.getInt16(position, littleEndian);
    case "ushort": case "uint16": return view.getUint16(position, littleEndian);
    case "int": case "int32": return view.getInt32(position, littleEndian);
    case "uint": case "uint32": return view.getUint32(position, littleEndian);
    case "float": case "float32": return view.getFloat32(position, littleEndian);
    default: return view.getFloat64(position, littleEndian);
  }
}

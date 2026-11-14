
export interface ImageInfo {
  width: number;
  height: number;
  extension: "png" | "jpg" | "bmp" | "tga";
}

export function readImageInfo(data: Buffer): ImageInfo | null {
  try {
    return readPng(data) ?? readJpeg(data) ?? readBmp(data) ?? readTga(data);
  } catch {
    return null;
  }
}

function readPng(data: Buffer): ImageInfo | null {
  const signature = "89504e470d0a1a0a";
  if (data.subarray(0, 8).toString("hex") !== signature) {
    return null;
  }
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), extension: "png" };
}

function readJpeg(data: Buffer): ImageInfo | null {
  if (data[0] !== 0xff || data[1] !== 0xd8) {
    return null;
  }
  let position = 2;
  while (position + 9 < data.length) {
    if (data[position] !== 0xff) {
      return null;
    }
    const marker = data[position + 1];
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { height: data.readUInt16BE(position + 5), width: data.readUInt16BE(position + 7), extension: "jpg" };
    }
    position += 2 + data.readUInt16BE(position + 2);
  }
  return null;
}

function readBmp(data: Buffer): ImageInfo | null {
  if (data.toString("latin1", 0, 2) !== "BM") {
    return null;
  }
  return { width: data.readInt32LE(18), height: Math.abs(data.readInt32LE(22)), extension: "bmp" };
}

function readTga(data: Buffer): ImageInfo | null {
  const imageType = data[2];
  const bitsPerPixel = data[16];
  const typeIsValid = [1, 2, 3, 9, 10, 11].includes(imageType);
  const bitsAreValid = [8, 15, 16, 24, 32].includes(bitsPerPixel);
  if (!typeIsValid || !bitsAreValid || data.length < 18) {
    return null;
  }
  return { width: data.readUInt16LE(12), height: data.readUInt16LE(14), extension: "tga" };
}

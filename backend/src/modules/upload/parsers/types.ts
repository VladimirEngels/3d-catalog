
export interface FoundFile {
  name: string;
  path: string;
}

export type FindFile = (reference: string) => FoundFile | undefined;

export type TextureSource =
  | { name: string; path: string }
  | { name: string; bytes: Buffer };

export interface ParsedModel {
  triangles: number;
  vertices: number;
  hasSkeleton: boolean;
  size: [number, number, number];
  materials: string[];
  textures: TextureSource[];
  companions: FoundFile[];
}

export class BoundingBox {
  private min = [Infinity, Infinity, Infinity];
  private max = [-Infinity, -Infinity, -Infinity];

  add(x: number, y: number, z: number): void {
    const point = [x, y, z];
    for (let axis = 0; axis < 3; axis++) {
      if (point[axis] < this.min[axis]) this.min[axis] = point[axis];
      if (point[axis] > this.max[axis]) this.max[axis] = point[axis];
    }
  }

  getSize(): [number, number, number] {
    return [this.max[0] - this.min[0], this.max[1] - this.min[1], this.max[2] - this.min[2]];
  }
}

export class ModelFileError extends Error {}

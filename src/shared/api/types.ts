export type FileFormat = "OBJ" | "STL" | "PLY" | "GLTF" | "GLB";

export interface Model {
  id: number;
  team_id: number;
  author_id: number;
  name: string;
  description: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ModelVersion {
  id: number;
  model_id: number;
  version_number: number;
  comment: string | null;
  triangles_count: number;
  vertices_count: number;
  has_skeleton: boolean;
  size_x: number;
  size_y: number;
  size_z: number;
  preview_path: string | null;
  created_at: string;
}

export interface CatalogItem {
  model: Model;
  version: ModelVersion;
  formats: FileFormat[];
}



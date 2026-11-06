// Заглушка: заготовленные данные, не из базы
import type { CatalogItem } from "../../shared/api/types";

export const demoModels: CatalogItem[] = [
  {
    model: { id: 1, team_id: 1, author_id: 1, name: "Стул офисный", description: "Стул на колёсах с подлокотниками",
      source_url: null, created_at: "2026-10-01T09:15:00Z", updated_at: "2026-10-01T09:15:00Z" },
    version: { id: 1, model_id: 1, version_number: 1, comment: null, triangles_count: 12480, vertices_count: 6310,
      has_skeleton: false, size_x: 0.6, size_y: 1.1, size_z: 0.6, preview_path: null, created_at: "2026-10-01T09:15:00Z" },
    formats: ["GLB"],
  },
  {
    model: { id: 2, team_id: 1, author_id: 2, name: "Стол письменный", description: null,
      source_url: null, created_at: "2026-10-03T14:40:00Z", updated_at: "2026-10-05T10:00:00Z" },
    version: { id: 2, model_id: 2, version_number: 1, comment: null, triangles_count: 8200, vertices_count: 4150,
      has_skeleton: false, size_x: 1.4, size_y: 0.75, size_z: 0.7, preview_path: null, created_at: "2026-10-03T14:40:00Z" },
    formats: ["OBJ", "GLB"],
  },
  {
    model: { id: 3, team_id: 1, author_id: 1, name: "Шестерня", description: "Деталь для 3D-печати",
      source_url: null, created_at: "2026-10-07T11:20:00Z", updated_at: "2026-10-07T11:20:00Z" },
    version: { id: 3, model_id: 3, version_number: 1, comment: null, triangles_count: 3960, vertices_count: 1990,
      has_skeleton: false, size_x: 0.08, size_y: 0.02, size_z: 0.08, preview_path: null, created_at: "2026-10-07T11:20:00Z" },
    formats: ["STL"],
  },
  {
    model: { id: 4, team_id: 1, author_id: 3, name: "Скан статуи", description: "Получена 3D-сканированием",
      source_url: null, created_at: "2026-10-10T16:05:00Z", updated_at: "2026-10-10T16:05:00Z" },
    version: { id: 4, model_id: 4, version_number: 1, comment: null, triangles_count: 54300, vertices_count: 27200,
      has_skeleton: false, size_x: 0.5, size_y: 1.8, size_z: 0.5, preview_path: null, created_at: "2026-10-10T16:05:00Z" },
    formats: ["PLY"],
  },
  {
    model: { id: 5, team_id: 1, author_id: 2, name: "Робот-помощник", description: "Персонаж для игры",
      source_url: null, created_at: "2026-10-12T08:30:00Z", updated_at: "2026-10-20T13:10:00Z" },
    version: { id: 5, model_id: 5, version_number: 2, comment: "Добавлен скелет для анимации", triangles_count: 21750, vertices_count: 11020,
      has_skeleton: true, size_x: 0.9, size_y: 1.6, size_z: 0.5, preview_path: null, created_at: "2026-10-20T13:10:00Z" },
    formats: ["GLTF", "GLB"],
  },
  {
    model: { id: 6, team_id: 1, author_id: 1, name: "Лампа настольная", description: null,
      source_url: null, created_at: "2026-10-15T12:00:00Z", updated_at: "2026-10-15T12:00:00Z" },
    version: { id: 6, model_id: 6, version_number: 1, comment: null, triangles_count: 2640, vertices_count: 1380,
      has_skeleton: false, size_x: 0.2, size_y: 0.45, size_z: 0.2, preview_path: null, created_at: "2026-10-15T12:00:00Z" },
    formats: ["OBJ"],
  },
  {
    model: { id: 7, team_id: 1, author_id: 3, name: "Корпус датчика", description: "Корпус для печати из пластика",
      source_url: null, created_at: "2026-10-22T15:45:00Z", updated_at: "2026-10-22T15:45:00Z" },
    version: { id: 7, model_id: 7, version_number: 1, comment: null, triangles_count: 5120, vertices_count: 2570,
      has_skeleton: false, size_x: 0.1, size_y: 0.04, size_z: 0.06, preview_path: null, created_at: "2026-10-22T15:45:00Z" },
    formats: ["STL", "GLB"],
  },
  {
    model: { id: 8, team_id: 1, author_id: 2, name: "Дерево", description: "Низкополигональное, для сцен",
      source_url: null, created_at: "2026-10-28T10:25:00Z", updated_at: "2026-10-28T10:25:00Z" },
    version: { id: 8, model_id: 8, version_number: 1, comment: null, triangles_count: 980, vertices_count: 520,
      has_skeleton: false, size_x: 2.5, size_y: 4.2, size_z: 2.5, preview_path: null, created_at: "2026-10-28T10:25:00Z" },
    formats: ["GLB"],
  },
];

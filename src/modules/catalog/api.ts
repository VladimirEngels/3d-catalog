import type { CatalogItem } from "../../shared/api/types";
import { demoModels } from "./demo-data";

export async function getModels(): Promise<CatalogItem[]> {
  return demoModels;
}

export async function getModel(id: number): Promise<CatalogItem | undefined> {
  return demoModels.find((item) => item.model.id === id);
}

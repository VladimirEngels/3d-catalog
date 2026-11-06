// Заглушка: заготовленные данные, не из базы
import type { CatalogItem } from "../../shared/api/types";
import { demoModels } from "./demo-data";


export async function getModels(): Promise<CatalogItem[]> {
  return demoModels;
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const metaPath = path.join(root, "data", "mall-meta.json");

let cache = null;

export function loadMallMeta() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    cache = { hero: null, categories: [] };
  }
  return cache;
}

export function defaultHero() {
  return (
    loadMallMeta().hero ?? {
      imageUrl: "",
      eyebrow: "QR SHOP",
      title: "Shop Myanmar",
      subtitle: "Local mall — delivery or pickup",
      cta: "Browse",
    }
  );
}

export function defaultCategories() {
  return loadMallMeta().categories ?? [];
}

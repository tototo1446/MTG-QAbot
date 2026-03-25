import type { TagTaxonomy } from "@/types";
import fs from "fs";
import path from "path";

const TAXONOMY_DIR = path.join(process.cwd(), "..", "config", "tag-taxonomies");

let _cache: Map<string, TagTaxonomy> | null = null;

/**
 * タグ体系JSONをファイルから読み込む（サーバーサイド専用）
 */
function loadTaxonomies(): Map<string, TagTaxonomy> {
  if (_cache) return _cache;

  _cache = new Map();
  try {
    const files = fs.readdirSync(TAXONOMY_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const data = JSON.parse(
        fs.readFileSync(path.join(TAXONOMY_DIR, file), "utf-8")
      ) as TagTaxonomy;
      _cache.set(data.id, data);
    }
  } catch {
    // config未配置時はデフォルトを使用
  }

  // デフォルトが無い場合はハードコードのフォールバック
  if (_cache.size === 0) {
    _cache.set("youtube", {
      id: "youtube",
      name: "YouTube運用",
      description: "YouTube運用チーム向けのタグ体系",
      fixedTags: ["企画", "撮影", "編集", "サムネ", "タイトル", "分析", "運用全般"],
    });
  }

  return _cache;
}

/**
 * デフォルトのタグ体系を取得
 */
export function getDefaultTaxonomy(): TagTaxonomy {
  const taxonomies = loadTaxonomies();
  return taxonomies.values().next().value!;
}

/**
 * 指定IDのタグ体系を取得
 */
export function getTaxonomy(id: string): TagTaxonomy | undefined {
  return loadTaxonomies().get(id);
}

/**
 * 全タグ体系を取得
 */
export function getAllTaxonomies(): TagTaxonomy[] {
  return [...loadTaxonomies().values()];
}

/**
 * タグ体系の固定タグ候補を取得（エイリアス展開済み）
 */
export function getFixedTagsWithAliases(taxonomy: TagTaxonomy): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const tag of taxonomy.fixedTags) {
    const aliases = taxonomy.aliases?.[tag] || [];
    result.set(tag, [tag, ...aliases]);
  }
  return result;
}

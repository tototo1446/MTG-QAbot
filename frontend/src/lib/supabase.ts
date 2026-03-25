import { createClient } from "@supabase/supabase-js";
import { getDefaultTaxonomy, getFixedTagsWithAliases } from "@/lib/taxonomy";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 質問文から固定タグを自動判定（taxonomy設定駆動）
 * エイリアスも含めてマッチする
 */
function detectFixedTags(question: string): string[] {
  const taxonomy = getDefaultTaxonomy();
  const tagMap = getFixedTagsWithAliases(taxonomy);
  const q = question.toLowerCase();
  const matched: string[] = [];

  for (const [tag, aliases] of tagMap) {
    if (aliases.some((alias) => q.includes(alias.toLowerCase()))) {
      matched.push(tag);
    }
  }

  return matched;
}

/**
 * 日本語テキストをキーワードに分割
 * 助詞・接続詞・質問表現で分割し、短すぎるトークンを除外
 */
function splitKeywords(text: string): string[] {
  // 質問末尾の定型表現を除去
  let cleaned = text
    .replace(/[？?！!。、,\s　]+$/g, "")
    .replace(/とは$/g, "")
    .replace(/って何$/g, "")
    .replace(/はどうすればいい$/g, "")
    .replace(/にはどうすればいい$/g, "")
    .replace(/はどうしたらいい$/g, "")
    .replace(/を教えて$/g, "")
    .replace(/について$/g, "");

  // 助詞・接続詞・句読点で分割
  const tokens = cleaned
    .split(
      /[\s　、。？！?!,]+|(?<=.)(?:していく|している|してる|すれば|したら|という|について|に対して|のために|によって|として|ための|における|に関する|ですか|ますか|だろう|でしょう|ている|ていく|ること|こと)(?=.)|(?<=.{2})(?:の|は|を|に|で|が|と|も|へ|から|まで|より|って|けど|ので|のに|ため|など|とか|だけ|しか|ほど|くらい|ぐらい|ように|ような|みたいな)(?=.{2})/g
    )
    .map((k) => k.trim())
    .filter((k) => k.length >= 2);

  // 元の質問文もキーワード候補に含める（短い場合）
  if (text.length >= 2 && text.length <= 10) {
    tokens.unshift(text.replace(/[？?！!。、,]+/g, ""));
  }

  // 重複除去
  return [...new Set(tokens)];
}

export interface KnowledgeResult {
  id: string;
  mtg_title: string;
  mtg_date: string;
  topic: string;
  time_range: string;
  question: string;
  answer: string;
  fixed_tags: string;
  free_tags: string;
  speaker: string;
  project: string;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

/**
 * OpenAI Embedding APIで質問のembeddingを生成
 */
async function getEmbedding(text: string): Promise<number[] | null> {
  if (!OPENAI_API_KEY) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

/**
 * ハイブリッド検索（ベクトル類似度 + キーワードスコア）
 * embeddingが利用可能な場合はhybrid_search RPCを使用
 * そうでない場合はキーワードのみのフォールバック
 */
export async function searchKnowledge(
  userQuestion: string,
  project?: string
): Promise<{ results: KnowledgeResult[]; count: number }> {
  const fixedTags = detectFixedTags(userQuestion);
  const keywords = splitKeywords(userQuestion);

  // embeddingを生成（失敗してもキーワード検索にフォールバック）
  const embedding = await getEmbedding(userQuestion);

  if (embedding) {
    // ハイブリッド検索（ベクトル + キーワード）
    try {
      const rpcParams: Record<string, unknown> = {
        p_embedding: embedding,
        p_keywords: keywords,
        p_fixed_tags: fixedTags,
        p_vector_weight: 0.6,
        p_keyword_weight: 0.4,
        p_limit: 20,
      };
      if (project) {
        rpcParams.p_project = project;
      }

      const { data, error } = await supabase.rpc(
        "hybrid_search",
        rpcParams
      );

      if (!error && data && data.length > 0) {
        return { results: data as KnowledgeResult[], count: data.length };
      }
    } catch {
      // hybrid_search RPCが未作成の場合はフォールバック
    }
  }

  // フォールバック: キーワードのみの検索（既存ロジック）
  return keywordSearch(keywords, fixedTags, project);
}

/**
 * キーワードのみの検索（フォールバック）
 */
async function keywordSearch(
  keywords: string[],
  fixedTags: string[],
  project?: string
): Promise<{ results: KnowledgeResult[]; count: number }> {
  let query = supabase
    .from("qa_knowledge")
    .select(
      "id, mtg_title, mtg_date, topic, time_range, question, answer, fixed_tags, free_tags, speaker, project"
    )
    .eq("status", "active");

  if (project) {
    query = query.eq("project", project);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Supabaseクエリエラー: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return { results: [], count: 0 };
  }

  // スコアリング
  const scored: { score: number; data: KnowledgeResult }[] = [];

  for (const row of data) {
    let score = 0;
    const rowFixedTags = (row.fixed_tags || "").toLowerCase();
    const rowFreeTags = (row.free_tags || "").toLowerCase();
    const rowQuestion = (row.question || "").toLowerCase();
    const rowAnswer = (row.answer || "").toLowerCase();
    const rowTopic = (row.topic || "").toLowerCase();

    for (const tag of fixedTags) {
      if (rowFixedTags.includes(tag.toLowerCase())) {
        score += 3;
      }
    }

    for (const k of keywords) {
      const kLower = k.toLowerCase();
      if (rowQuestion.includes(kLower)) score += 3;
      if (rowAnswer.includes(kLower)) score += 2;
      if (rowTopic.includes(kLower)) score += 1;
      if (rowFreeTags.includes(kLower)) score += 1;
    }

    if (score > 0) {
      scored.push({
        score,
        data: {
          id: row.id,
          mtg_title: row.mtg_title,
          mtg_date: row.mtg_date,
          topic: row.topic,
          time_range: row.time_range,
          question: row.question,
          answer: row.answer,
          fixed_tags: row.fixed_tags,
          free_tags: row.free_tags,
          speaker: row.speaker,
          project: row.project || "",
        },
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, 20).map((s) => s.data);

  return { results, count: results.length };
}

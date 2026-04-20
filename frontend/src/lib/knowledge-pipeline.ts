import { randomUUID } from "crypto";
import { supabase } from "@/lib/supabase";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_LLM_MODEL = "gemini-3-flash-preview";
const EMBEDDING_BATCH_SIZE = 100;

// QA生成の並列度。クライアント側で最大10ジョブ並列実行されるため、
// 合計 10 × QA_CONCURRENCY が Gemini への同時リクエスト数になる。
// Gemini 2.5 Flash の RPM 制限を踏まえ、合計 ~20 並列に収まる 2 に設定。
const QA_CONCURRENCY = 2;
// Gemini fetch のタイムアウト（ミリ秒）
const GEMINI_FETCH_TIMEOUT_MS = 60_000;
// リトライ最大回数（初回 + リトライN回）
const GEMINI_MAX_RETRIES = 2;

/**
 * AbortSignal付きfetch + 指数バックオフリトライ
 * 5xx / 429 / ネットワーク瞬断 / タイムアウトで最大 GEMINI_MAX_RETRIES 回リトライ
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { timeoutMs?: number; maxRetries?: number } = {}
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? GEMINI_FETCH_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? GEMINI_MAX_RETRIES;

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      // リトライ対象のステータス
      if (res.status >= 500 || res.status === 429) {
        if (attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || err.message.includes("aborted"));
      if (attempt < maxRetries) {
        const delay = 1000 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (isAbort) {
        throw new Error(
          `Gemini API タイムアウト（${timeoutMs / 1000}秒×${maxRetries + 1}回失敗）`
        );
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("fetch 失敗");
}

/**
 * 最大同時実行数を制限して items を fn で並列処理（プロマイスプール）
 */
async function runPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        results[idx] = await fn(items[idx], idx);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

// --- Types ---

interface TranscriptChunk {
  topic: string;
  content: string;
  speakers: string[];
  time_range: string;
}

interface QAPair {
  question: string;
  answer: string;
  fixed_tags: string[];
  free_tags: string[];
  speaker: string;
}

interface ParseResult {
  cleaned: string;
  speakers: string[];
  lineCount: number;
  originalLineCount: number;
  stats: TranscriptStats;
}

interface TranscriptStats {
  droppedLineCount: number;
  shortLineCount: number;
  lowSignalLineCount: number;
  averageContentLength: number;
  lowSignalRatio: number;
  retainedRatio: number;
}

// --- Project Classification ---

const PROJECT_RULES: [string[], string][] = [
  [["youtube", "yt", "動画", "サムネ", "チャンネル"], "YouTube運用"],
  [["ミサオ", "みさお"], "ミサオch"],
  [["あおんぼ", "顧問"], "あおんぼ顧問"],
  [["バズ塾", "ショート"], "バズ塾"],
  [["定例", "全体"], "全体定例"],
];

function classifyProjectByRule(mtgTitle: string): string {
  const title = mtgTitle.toLowerCase();
  for (const [keywords, project] of PROJECT_RULES) {
    for (const kw of keywords) {
      if (title.includes(kw.toLowerCase())) {
        return project;
      }
    }
  }
  return "";
}

async function fetchExistingProjects(): Promise<string[]> {
  // DB側で DISTINCT を行う RPC を呼び出す。
  // payload はプロジェクト種類数に比例するのみで、コーパスサイズに依存しない。
  // singleton project も含めて全て返す（再処理時のカテゴリ churn 回避のため）。
  const { data, error } = await supabase.rpc("get_existing_projects");

  if (error) {
    // Fail closed: 呼び出し元の try-catch で現在ラベル or rule-based にフォールバック。
    // 空配列を返すと新規カテゴリが勝手に作られてしまうため、例外で明示的に失敗させる。
    throw new Error(`既存プロジェクト取得失敗: ${error.message}`);
  }

  return ((data || []) as { project: string }[])
    .map((r) => r.project)
    .filter(Boolean);
}

/**
 * 再処理対象MTGに既に付与されているproject（= 現在ラベル）を取得。
 * 存在しない or エラー時は null を返し、新規アップロード扱いにする。
 *
 * 注: 1 MTG = 多数のQA行なので maybeSingle() は使えない（複数行ヒットでエラーになる）。
 * .limit(1) で1行だけ取得して先頭要素から project を取り出す。
 */
async function fetchCurrentProjectForMtg(
  mtgTitle: string,
  mtgDate: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("qa_knowledge")
    .select("project")
    .eq("mtg_title", mtgTitle)
    .eq("mtg_date", mtgDate)
    .eq("status", "active")
    .neq("project", "")
    .not("project", "is", null)
    .limit(1);

  if (error) {
    console.warn("現在プロジェクト取得エラー:", error.message);
    return null;
  }

  return data?.[0]?.project ?? null;
}

interface ClassifyInput {
  mtgTitle: string;
  summary: string;
  qaSamples: { question: string; answer: string; topic: string }[];
  existingProjects: string[];
  currentProject: string | null;
}

async function classifyProjectWithAI(input: ClassifyInput): Promise<string> {
  const { mtgTitle, summary, qaSamples, existingProjects, currentProject } = input;

  const systemPrompt = `あなたはMTGナレッジのプロジェクト分類の専門家です。

## タスク

MTGの内容を分析し、プロジェクトカテゴリを決定してください。

## ルール

- **現在のラベルが既に付いている場合、内容が大きく変わっていなければ原則そのラベルを維持してください**（再処理でカテゴリがブレるのを防ぐため）
- 現在のラベルと内容が明らかに合わない場合のみ、別のカテゴリに変更してください
- 既存プロジェクト一覧の中に概念的に類似するカテゴリがあれば、そのカテゴリ名を**そのまま**返してください
- 類似度が明らかに低い場合のみ、新しいカテゴリ名を提案してください
- カテゴリ名は簡潔に、業務単位で（例: "YouTube運用", "ミサオch", "バズ塾" のような粒度）
- 既存プロジェクトの命名規則・粒度を参考にしてください
- 個別の議事録単位ではなく、**継続的な業務カテゴリ**として名付けてください

## 出力形式

必ず以下のJSON形式のみで回答してください。説明文やマークダウンは不要です。

{"project": "プロジェクト名", "reasoning": "判断理由（簡潔に）"}`;

  const samplesText = qaSamples
    .slice(0, 5)
    .map(
      (qa, i) =>
        `[${i + 1}] トピック: ${qa.topic}\nQ: ${qa.question}\nA: ${qa.answer}`
    )
    .join("\n\n");

  const userPrompt = `## MTGタイトル
${mtgTitle}

## 現在のラベル
${currentProject || "（未分類 / 新規アップロード）"}

## MTG要約
${summary || "（要約なし）"}

## QAサンプル
${samplesText || "（サンプルなし）"}

## 既存プロジェクト一覧
${
  existingProjects.length > 0
    ? existingProjects.map((p) => `- ${p}`).join("\n")
    : "（まだプロジェクトは存在しません）"
}

上記のMTG内容を分析し、最も適切なプロジェクトカテゴリを決定してください。`;

  const res = await fetchWithRetry(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    },
    { timeoutMs: 30_000 }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`プロジェクト分類APIエラー: ${errText}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("プロジェクト分類: レスポンスが空です");

  const parsed = JSON.parse(content);
  const project = (parsed.project || "").trim();

  if (!project) throw new Error("プロジェクト分類: 空の結果が返されました");

  return project;
}

// --- 1. Text Parsing (Dify code_parse equivalent) ---

const TIMESTAMP_REGEX = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+([^:]+):\s*(.+)$/;
const FILLER_REGEX = new RegExp(
  "\\b(u+h+|u+m+|e+h+m*|h+m+|a+h+|m+h*m*|mhm|mm-hmm|mmhmm|" +
    "heh|haha+|hihi+|aye|ooh|nah|" +
    "えー+|あー+|あの+|うー+|んー+|まあ+|ええ+|そのー+)\\b[,.\\s]*",
  "gi"
);
const REPEAT_REGEX = /\b(\w+)\s+(\1\s+){2,}/gi;
const CONTENT_CHARS_REGEX = /[^a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g;
const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/;
const TIME_RANGE_REGEX = /^(\d{1,2}:\d{2}(?::\d{2})?)/;

function isLowSignalUtterance(cleaned: string, contentOnly: string): boolean {
  const normalized = cleaned.toLowerCase();
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.replace(/[^a-zA-Z\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, ""))
    .filter(Boolean);
  const uniqueTokenCount = new Set(tokens).size;
  const hasJapanese = JAPANESE_CHAR_REGEX.test(cleaned);

  if (contentOnly.length <= 3) return true;
  if (tokens.length >= 4 && uniqueTokenCount <= 1) return true;
  if (!hasJapanese && tokens.length >= 5 && uniqueTokenCount <= 2) return true;

  return false;
}

function parseTimestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(":").map(Number);
  return parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
}

function formatSeconds(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  return `${m}:${s.toString().padStart(2, "0")}`;
}

function extractTimeRange(content: string): string {
  const lines = content.split("\n").filter(Boolean);
  const firstMatch = lines[0]?.match(TIME_RANGE_REGEX);
  const lastMatch = lines[lines.length - 1]?.match(TIME_RANGE_REGEX);

  if (!firstMatch || !lastMatch) return "";
  return `${firstMatch[1]}-${lastMatch[1]}`;
}

function buildFallbackChunks(cleaned: string, speakers: string[]): TranscriptChunk[] {
  const lines = cleaned.split("\n").filter(Boolean);
  if (lines.length === 0) return [];

  const MAX_LINES_PER_CHUNK = 12;
  const MAX_DURATION_SECONDS = 8 * 60;
  const chunks: TranscriptChunk[] = [];
  let currentLines: string[] = [];
  let currentStart: number | null = null;
  let currentEnd: number | null = null;
  let chunkIndex = 1;

  const flush = () => {
    if (currentLines.length === 0) return;
    const content = currentLines.join("\n");
    const timeRange =
      currentStart !== null && currentEnd !== null
        ? `${formatSeconds(currentStart)}-${formatSeconds(currentEnd)}`
        : extractTimeRange(content);

    chunks.push({
      topic: `暫定チャンク ${chunkIndex}`,
      content,
      speakers,
      time_range: timeRange,
    });

    chunkIndex++;
    currentLines = [];
    currentStart = null;
    currentEnd = null;
  };

  for (const line of lines) {
    const match = line.match(TIMESTAMP_REGEX);
    const timestamp = match?.[1];
    const seconds = timestamp ? parseTimestampToSeconds(timestamp) : null;
    const durationExceeded =
      currentStart !== null && seconds !== null
        ? seconds - currentStart >= MAX_DURATION_SECONDS
        : false;

    if (currentLines.length >= MAX_LINES_PER_CHUNK || durationExceeded) {
      flush();
    }

    currentLines.push(line);
    if (seconds !== null) {
      if (currentStart === null) currentStart = seconds;
      currentEnd = seconds;
    }
  }

  flush();
  return chunks;
}

function buildChunkingFailureMessage(stats: TranscriptStats): string {
  const retainedPercent = Math.round(stats.retainedRatio * 100);
  const lowSignalPercent = Math.round(stats.lowSignalRatio * 100);

  return `チャンク分割の結果が空です。文字起こし品質が低く、有意義な内容として抽出できなかった可能性があります。解析後の残存率: ${retainedPercent}% (${stats.droppedLineCount}行除外)、低シグナル率: ${lowSignalPercent}%、平均発話長: ${stats.averageContentLength.toFixed(1)}文字。`;
}

export function parseTranscript(text: string): ParseResult {
  const lines = text.trim().split("\n");
  const parsedLines: string[] = [];
  const speakersSet = new Set<string>();
  let shortLineCount = 0;
  let lowSignalLineCount = 0;
  let totalContentLength = 0;

  // Timestamp without speaker: "39:33 テキスト内容"
  const TIMESTAMP_NOSPEAKER_REGEX = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/;

  // --- Pass 1: Try timestamp-based formats ---
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Format A: "0:00 Speaker: text"
    const fullMatch = line.match(TIMESTAMP_REGEX);
    if (fullMatch) {
      const timestamp = fullMatch[1];
      const speaker = fullMatch[2].trim();
      let cleaned = fullMatch[3].trim();
      cleaned = cleaned.replace(FILLER_REGEX, " ");
      cleaned = cleaned.replace(REPEAT_REGEX, "$1 ");
      cleaned = cleaned.replace(/\s+/g, " ").trim();
      const contentOnly = cleaned.replace(CONTENT_CHARS_REGEX, "");
      if (!contentOnly || contentOnly.length < 2) { shortLineCount++; continue; }
      if (isLowSignalUtterance(cleaned, contentOnly)) { lowSignalLineCount++; continue; }
      speakersSet.add(speaker);
      parsedLines.push(`${timestamp} ${speaker}: ${cleaned}`);
      totalContentLength += contentOnly.length;
      continue;
    }

    // Format B: "0:00 text" (no speaker)
    const tsMatch = line.match(TIMESTAMP_NOSPEAKER_REGEX);
    if (tsMatch) {
      const timestamp = tsMatch[1];
      let cleaned = tsMatch[2].trim();
      cleaned = cleaned.replace(FILLER_REGEX, " ");
      cleaned = cleaned.replace(REPEAT_REGEX, "$1 ");
      cleaned = cleaned.replace(/\s+/g, " ").trim();
      const contentOnly = cleaned.replace(CONTENT_CHARS_REGEX, "");
      if (!contentOnly || contentOnly.length < 2) { shortLineCount++; continue; }
      if (isLowSignalUtterance(cleaned, contentOnly)) { lowSignalLineCount++; continue; }
      speakersSet.add("不明");
      parsedLines.push(`${timestamp} 不明: ${cleaned}`);
      totalContentLength += contentOnly.length;
    }
  }

  // --- Pass 2: Plain text fallback (no timestamps at all) ---
  if (parsedLines.length === 0) {
    shortLineCount = 0;
    lowSignalLineCount = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      let cleaned = line;
      cleaned = cleaned.replace(FILLER_REGEX, " ");
      cleaned = cleaned.replace(REPEAT_REGEX, "$1 ");
      cleaned = cleaned.replace(/\s+/g, " ").trim();
      if (!cleaned) continue;
      const contentOnly = cleaned.replace(CONTENT_CHARS_REGEX, "");
      if (!contentOnly || contentOnly.length < 2) { shortLineCount++; continue; }
      if (isLowSignalUtterance(cleaned, contentOnly)) { lowSignalLineCount++; continue; }
      speakersSet.add("不明");
      parsedLines.push(cleaned);
      totalContentLength += contentOnly.length;
    }
  }

  const lineCount = parsedLines.length;
  const droppedLineCount = Math.max(0, lines.length - lineCount);
  const averageContentLength = lineCount > 0 ? totalContentLength / lineCount : 0;
  const lowSignalRatio = lineCount > 0 ? lowSignalLineCount / (lineCount + lowSignalLineCount) : 0;
  const retainedRatio = lines.length > 0 ? lineCount / lines.length : 0;

  return {
    cleaned: parsedLines.join("\n"),
    speakers: [...speakersSet].sort(),
    lineCount,
    originalLineCount: lines.length,
    stats: {
      droppedLineCount,
      shortLineCount,
      lowSignalLineCount,
      averageContentLength,
      lowSignalRatio,
      retainedRatio,
    },
  };
}

// --- 2. Chunk Splitting via Gemini ---

async function splitIntoChunks(
  cleaned: string,
  speakers: string[],
  mtgTitle: string,
  mtgDate: string,
  lineCount: number,
  originalLineCount: number
): Promise<{ chunks: TranscriptChunk[]; summary: string }> {
  const systemPrompt = `あなたはMTGの文字起こしテキストを分析し、話題単位でチャンク分割する専門家です。

## タスク

文字起こしテキストを話題の区切りで分割し、各チャンクにトピック名を付けてください。

## 話者情報

このMTGの参加者: ${JSON.stringify(speakers)}

## ルール

- 1つのチャンクは1つの話題に対応させてください
- チャンクが細かいほど、後のQA生成の精度が上がります
- 雑談・意味のないやり取りだけのチャンクは省略してください
- 各チャンクのcontentには話者名付きの発言をそのまま含めてください
- タイムスタンプ情報も保持してください
- 文字起こしの品質が低い部分（意味が通じない箇所）は除外してOKです
- 有意義な内容が全くない場合は空配列を返してください

## 出力形式

必ず以下のJSON形式のみで回答してください。説明文やマークダウンは不要です。

{"chunks": [{"topic": "チャンクの話題名", "content": "話者名付きの会話内容", "speakers": ["話者A", "話者B"], "time_range": "03:00-07:30"}], "summary": "MTG全体の概要（1〜2文）"}`;

  const userPrompt = `以下のMTG文字起こしテキストを話題チャンクに分割してください。

MTGタイトル: ${mtgTitle}

日付: ${mtgDate}

---文字起こし（ノイズ除去済み、${lineCount}行 / 元${originalLineCount}行）---

${cleaned}`;

  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_LLM_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
          maxOutputTokens: 32768,
        },
      }),
    },
    { timeoutMs: 90_000 }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`チャンク分割APIエラー: ${errText}`);
  }

  const data = await res.json();
  const finishReason = data.candidates?.[0]?.finishReason;
  if (finishReason === "MAX_TOKENS") {
    throw new Error("チャンク分割: レスポンスが長すぎて途中で切断されました。テキストを短くして再試行してください。");
  }
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("チャンク分割: レスポンスが空です");

  const parsed = JSON.parse(content);
  return {
    chunks: parsed.chunks || [],
    summary: parsed.summary || "",
  };
}

// --- 3. QA Generation via Gemini ---

async function generateQAPairs(chunkJson: string): Promise<QAPair[]> {
  const systemPrompt = `あなたはMTGの会話チャンクからQ&Aナレッジを生成する専門家です。

## タスク

与えられた会話チャンクから、検索可能なQ&Aペアを生成してください。

## 固定タグ（YouTube運用カテゴリ）

以下から該当するものを選択してください（複数可）：

- 企画
- 撮影
- 編集
- サムネ
- タイトル
- 分析
- 運用全般

## 自由タグ

会話内容から適切なキーワードタグを自動生成してください（例：CTR改善、冒頭離脱、コメント誘導など）

## ルール

- 1チャンクから複数のQAを生成してください（粒度は細かいほど良い）
- Questionは「〜とは？」「〜はどうすればいい？」など検索されやすい形にしてください
- Answerは具体的で、会話の文脈がなくても理解できる形にしてください
- 話者情報も保持してください（誰が言った知見か分かるように）
- 文字起こしの品質が低く意味が不明確な部分からは無理にQAを作らないでください
- QAが1つも作れない場合は空配列を返してください

## 出力形式

必ず以下のJSON形式のみで回答してください。説明文やマークダウンは不要です。

{"qa_pairs": [{"question": "質問文", "answer": "回答文", "fixed_tags": ["タグ1"], "free_tags": ["キーワード1"], "speaker": "話者名"}]}`;

  const res = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_LLM_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: `以下の会話チャンクからQ&Aナレッジを生成してください。\n\n${chunkJson}` }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
          maxOutputTokens: 16384,
        },
      }),
    },
    { timeoutMs: 60_000 }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`QA生成APIエラー: ${errText}`);
  }

  const data = await res.json();
  const finishReason = data.candidates?.[0]?.finishReason;
  if (finishReason === "MAX_TOKENS") {
    throw new Error("QA生成: レスポンスが長すぎて途中で切断されました");
  }
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("QA生成: レスポンスが空です");

  const parsed = JSON.parse(content);
  return parsed.qa_pairs || [];
}

// --- 4. Embedding Generation ---

async function generateEmbeddings(
  rows: { id: string; question: string; answer: string }[],
  send: (data: Record<string, unknown>) => void
): Promise<number> {
  let processed = 0;

  for (let i = 0; i < rows.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = rows.slice(i, i + EMBEDDING_BATCH_SIZE);
    const texts = batch.map((r) => `${r.question} ${r.answer}`);

    const embRes = await fetchWithRetry(
      "https://api.openai.com/v1/embeddings",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: texts,
        }),
      },
      { timeoutMs: 45_000 }
    );

    if (!embRes.ok) {
      const errText = await embRes.text();
      send({
        event: "node_finished",
        data: { status: "failed", title: "Embedding生成", error: `OpenAI APIエラー: ${errText}` },
      });
      return processed;
    }

    const embData = await embRes.json();
    const embeddings = embData.data || [];

    for (let j = 0; j < batch.length; j++) {
      if (j < embeddings.length) {
        const { error: updateError } = await supabase
          .from("qa_knowledge")
          .update({ embedding: embeddings[j].embedding })
          .eq("id", batch[j].id);

        if (updateError) {
          send({
            event: "node_finished",
            data: { status: "failed", title: "Embedding更新", error: `ID ${batch[j].id}: ${updateError.message}` },
          });
        }
      }
    }

    processed += batch.length;
  }

  return processed;
}

// --- 5. Main Pipeline ---

export async function runKnowledgePipeline(
  input: { text: string; mtgTitle: string; mtgDate: string },
  send: (data: Record<string, unknown>) => void
): Promise<void> {
  const { text, mtgTitle, mtgDate } = input;

  // Step 1: Text parsing
  send({ event: "node_started", data: { title: "テキスト解析" } });
  const parsed = parseTranscript(text);

  if (parsed.lineCount === 0) {
    throw new Error("有効な行がありません。テキストの内容が短すぎるか、意味のある内容が含まれていない可能性があります。");
  }
  send({ event: "node_finished", data: { status: "succeeded", title: "テキスト解析" } });

  // Step 2: Chunk splitting
  send({ event: "node_started", data: { title: "チャンク分割" } });
  const { chunks, summary } = await splitIntoChunks(
    parsed.cleaned,
    parsed.speakers,
    mtgTitle,
    mtgDate,
    parsed.lineCount,
    parsed.originalLineCount
  );

  const effectiveChunks =
    chunks.length > 0 ? chunks : buildFallbackChunks(parsed.cleaned, parsed.speakers);

  if (chunks.length === 0 && effectiveChunks.length > 0) {
    send({
      event: "node_finished",
      data: {
        status: "warning",
        title: "チャンク分割",
        error:
          "LLMのチャンク分割結果が空だったため、時間帯ベースの簡易チャンクにフォールバックしました。",
      },
    });
  }

  if (effectiveChunks.length === 0) {
    throw new Error(buildChunkingFailureMessage(parsed.stats));
  }
  send({ event: "node_finished", data: { status: "succeeded", title: "チャンク分割" } });

  // Step 3: QA generation per chunk（並列実行）
  // 並列完了順に依存せず transcript 順で扱えるよう chunkIndex を保持する
  const allQAPairs: (QAPair & {
    topic: string;
    time_range: string;
    chunkIndex: number;
  })[] = [];
  const totalChunks = effectiveChunks.length;
  let completedCount = 0;
  let failedCount = 0;

  send({
    event: "node_started",
    data: { title: `QA生成中 (0/${totalChunks})` },
  });

  await runPool(effectiveChunks, QA_CONCURRENCY, async (chunk, idx) => {
    const chunkTitle = `QA生成 [${idx + 1}]: ${chunk.topic}`;
    try {
      const qaPairs = await generateQAPairs(JSON.stringify(chunk));
      for (const qa of qaPairs) {
        allQAPairs.push({
          ...qa,
          topic: chunk.topic,
          time_range: chunk.time_range,
          chunkIndex: idx,
        });
      }
      completedCount++;
      send({
        event: "node_finished",
        data: { status: "succeeded", title: chunkTitle },
      });
    } catch (err) {
      failedCount++;
      const errorMsg = err instanceof Error ? err.message : "不明なエラー";
      send({
        event: "node_finished",
        data: { status: "failed", title: chunkTitle, error: errorMsg },
      });
      // Skip failed chunk and continue
    }
    // 進捗を定期送信（フロントに残り状況を見せる）
    send({
      event: "node_started",
      data: {
        title: `QA生成中 (${completedCount + failedCount}/${totalChunks} 完了, 失敗 ${failedCount})`,
      },
    });
  });

  if (allQAPairs.length === 0) {
    throw new Error("QAペアが1つも生成できませんでした。");
  }

  // Step 3.5: AI Project Classification
  send({ event: "node_started", data: { title: "プロジェクト分類" } });
  let project = "";
  // 再処理時の現在ラベル（削除される前に取得）。transient 失敗時の既存ラベル保持、
  // および singleton project の churn 回避に使う。
  const currentProject = await fetchCurrentProjectForMtg(mtgTitle, mtgDate);
  try {
    const existingProjects = await fetchExistingProjects();
    // singleton project（自MTGだけが持つラベル）も候補に含め、再処理時の rename を防ぐ
    const candidates =
      currentProject && !existingProjects.includes(currentProject)
        ? [...existingProjects, currentProject].sort()
        : existingProjects;

    // 並列生成で順不同になった QA を chunkIndex で安定ソートし、
    // 同じ入力に対して常に同じサンプルが分類器に渡るようにする
    const orderedQAPairs = [...allQAPairs].sort(
      (a, b) => a.chunkIndex - b.chunkIndex
    );
    project = await classifyProjectWithAI({
      mtgTitle,
      summary,
      qaSamples: orderedQAPairs.map((qa) => ({
        question: qa.question,
        answer: qa.answer,
        topic: qa.topic,
      })),
      existingProjects: candidates,
      currentProject,
    });
    send({
      event: "node_finished",
      data: { status: "succeeded", title: `プロジェクト分類: ${project}` },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "不明なエラー";
    // transient failure 時：既存ラベルがあればそれを保持して破壊的変更を防ぐ。
    // 未分類（新規MTG）の場合のみ rule-based にフォールバック。
    if (currentProject) {
      project = currentProject;
      send({
        event: "node_finished",
        data: {
          status: "warning",
          title: "プロジェクト分類",
          error: `AI分類に失敗したため既存ラベル「${currentProject}」を維持: ${errorMsg}`,
        },
      });
    } else {
      project = classifyProjectByRule(mtgTitle);
      send({
        event: "node_finished",
        data: {
          status: "warning",
          title: "プロジェクト分類",
          error: `AI分類に失敗したためルールベースにフォールバック: ${errorMsg}${project ? `（${project}）` : "（未分類）"}`,
        },
      });
    }
  }

  // Step 4: Database insert (既存データがあれば置き換え)
  send({ event: "node_started", data: { title: "データベース書き込み" } });

  // 同じMTGの既存QAデータを削除（重複防止）
  const { error: deleteError } = await supabase
    .from("qa_knowledge")
    .delete()
    .eq("mtg_title", mtgTitle)
    .eq("mtg_date", mtgDate);

  if (deleteError) {
    console.warn("既存データ削除時の警告:", deleteError.message);
    // 削除失敗は致命的ではないので続行（新規MTGの場合は削除対象なし）
  }

  const rows = allQAPairs.map((qa) => ({
    id: randomUUID(),
    mtg_title: mtgTitle,
    mtg_date: mtgDate,
    topic: qa.topic,
    time_range: qa.time_range,
    question: qa.question,
    answer: qa.answer,
    fixed_tags: qa.fixed_tags.join(", "),
    free_tags: qa.free_tags.join(", "),
    speaker: qa.speaker,
    project,
    status: "active" as const,
  }));

  const { data: insertedRows, error: insertError } = await supabase
    .from("qa_knowledge")
    .insert(rows)
    .select("id, question, answer");

  if (insertError) {
    const msg = insertError.message || "";
    const cleanMsg = msg.includes("<html") || msg.includes("<!DOCTYPE")
      ? "Supabaseに接続できません（502 Bad Gateway）。Supabaseダッシュボードでプロジェクトの状態を確認してください"
      : msg;
    throw new Error(`データベース書き込みエラー: ${cleanMsg}`);
  }
  send({ event: "node_finished", data: { status: "succeeded", title: "データベース書き込み" } });

  // Step 5: Embedding generation
  send({ event: "node_started", data: { title: "Embedding生成" } });
  if (insertedRows && insertedRows.length > 0) {
    await generateEmbeddings(insertedRows, send);
  }
  send({ event: "node_finished", data: { status: "succeeded", title: "Embedding生成" } });

  // Step 6: Complete
  const qaData = rows.map((r) => ({
    mtg_title: r.mtg_title,
    mtg_date: r.mtg_date,
    topic: r.topic,
    time_range: r.time_range,
    question: r.question,
    answer: r.answer,
    fixed_tags: r.fixed_tags,
    free_tags: r.free_tags,
    speaker: r.speaker,
    project: r.project,
  }));

  send({
    event: "workflow_finished",
    data: {
      status: "succeeded",
      outputs: {
        chunk_count: effectiveChunks.length,
        qa_count: allQAPairs.length,
        summary,
        qa_data: qaData,
      },
    },
  });
}

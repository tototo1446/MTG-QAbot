import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  convertOpenAIStreamToDifyFormat,
  createSSEResponse,
  SSE_HEADERS,
} from "@/lib/openai-stream";

export const maxDuration = 120;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const ANALYSIS_SYSTEM_PROMPT = `あなたは組織の課題を分析し、具体的な改善提案を行う専門家です。

## タスク
MTGのQ&Aナレッジデータから、組織が抱える課題を抽出し、以下の3軸で分類・提案してください。

## 3つの解決軸
1. **システム解決** - ツール導入、自動化、テンプレート化などで解決できる課題
2. **研修解決** - トレーニング、マニュアル整備、ナレッジ共有で解決できる課題
3. **採用解決** - 人員補充、専門スキル人材の確保で解決できる課題

## 出力形式
以下のMarkdown形式で出力してください：

### 課題の概要
（期間中に検出された主な課題を要約）

### 1. システム解決が有効な課題
- **課題名**: 具体的な内容
  - 根拠: どのMTGで言及されたか
  - 提案: 具体的な解決策

### 2. 研修解決が有効な課題
- **課題名**: 具体的な内容
  - 根拠: どのMTGで言及されたか
  - 提案: 具体的な解決策

### 3. 採用解決が有効な課題
- **課題名**: 具体的な内容
  - 根拠: どのMTGで言及されたか
  - 提案: 具体的な解決策

### 優先順位の提案
（コスト対効果を考慮した実行順序の推奨）

## ルール
- データに基づいた分析のみ行い、推測は最小限にする
- 具体的なアクションアイテムを含める
- 各課題に対して実現可能性とインパクトを考慮する`;

export async function POST(request: NextRequest) {
  try {
    const { startDate, endDate, project } = await request.json();

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "期間を指定してください" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Supabaseからデータ取得
    let query = supabase
      .from("qa_knowledge")
      .select(
        "mtg_title, mtg_date, topic, question, answer, fixed_tags, free_tags, speaker, project"
      )
      .eq("status", "active")
      .gte("mtg_date", startDate)
      .lte("mtg_date", endDate)
      .order("mtg_date", { ascending: true });

    if (project) {
      query = query.eq("project", project);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Supabaseクエリエラー: ${error.message}`);
    }

    if (!data || data.length === 0) {
      return createSSEResponse(
        "指定された期間・条件に該当するナレッジデータがありませんでした。期間を広げるか、フィルターを変更してください。",
        { qa_count: 0 }
      );
    }

    // コンテキスト構築
    const context = data
      .map(
        (r, i) =>
          `[${i + 1}] MTG: ${r.mtg_title}（${r.mtg_date}）\nトピック: ${r.topic}\nQ: ${r.question}\nA: ${r.answer}\nタグ: ${r.fixed_tags} / ${r.free_tags}${r.speaker ? `\n発言者: ${r.speaker}` : ""}${r.project ? `\nプロジェクト: ${r.project}` : ""}`
      )
      .join("\n\n");

    const userPrompt = `以下のMTGナレッジデータ（${data.length}件、期間: ${startDate} 〜 ${endDate}${project ? `、プロジェクト: ${project}` : ""}）から課題を分析してください。

${context}`;

    // OpenAI APIをストリーミングで呼び出し
    const openaiRes = await fetch(
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
            { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          stream: true,
          temperature: 0.4,
        }),
      }
    );

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      throw new Error(`OpenAI APIエラー: ${errText}`);
    }

    if (!openaiRes.body) {
      throw new Error("ストリーミングレスポンスが取得できませんでした");
    }

    const stream = convertOpenAIStreamToDifyFormat(openaiRes.body, {
      qa_count: data.length,
    });

    return new Response(stream, { headers: SSE_HEADERS });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "不明なエラーが発生しました";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

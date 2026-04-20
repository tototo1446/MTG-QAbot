import { NextRequest } from "next/server";
import { searchKnowledge } from "@/lib/supabase";
import {
  convertOpenAIStreamToDifyFormat,
  createSSEResponse,
  SSE_HEADERS,
} from "@/lib/openai-stream";

export const maxDuration = 60;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

const SYSTEM_PROMPT = `あなたはMTG（ミーティング）のナレッジベースを活用して質問に回答するアシスタントです。

## ルール
- 提供されたナレッジのみに基づいて回答してください
- ナレッジに含まれない情報は推測せず、「該当するナレッジが見つかりませんでした」と回答してください
- 回答は簡潔かつ具体的に、要点を押さえて回答してください
- 複数のナレッジが関連する場合は、それらを統合して回答してください
- MTGの日付や発言者の情報がある場合は、参考情報として含めてください`;

export async function POST(request: NextRequest) {
  try {
    const { question, project } = await request.json();

    if (!question || typeof question !== "string") {
      return new Response(
        JSON.stringify({ error: "質問を入力してください" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Supabaseでナレッジ検索（ハイブリッド検索）
    const { results, count } = await searchKnowledge(question, project);

    // 検索0件の場合はLLMを呼ばず固定メッセージを返却
    if (count === 0) {
      return createSSEResponse(
        "該当するナレッジが見つかりませんでした。別のキーワードで質問してみてください。",
        { search_count: 0 }
      );
    }

    // コンテキスト構築
    const context = results
      .map(
        (r, i) =>
          `【ナレッジ${i + 1}】\nMTG: ${r.mtg_title}（${r.mtg_date}）\nトピック: ${r.topic}\nQ: ${r.question}\nA: ${r.answer}\nタグ: ${r.fixed_tags} / ${r.free_tags}${r.speaker ? `\n発言者: ${r.speaker}` : ""}${r.project ? `\nプロジェクト: ${r.project}` : ""}`
      )
      .join("\n\n");

    const userPrompt = `以下のナレッジを参考に、ユーザーの質問に回答してください。

## 参照ナレッジ（${count}件）
${context}

## ユーザーの質問
${question}`;

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
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          stream: true,
          temperature: 0.3,
        }),
      }
    );

    if (!openaiRes.ok) {
      const error = await openaiRes.text();
      throw new Error(`OpenAI APIエラー: ${error}`);
    }

    if (!openaiRes.body) {
      throw new Error(
        "OpenAIからのストリーミングレスポンスが取得できませんでした"
      );
    }

    const stream = convertOpenAIStreamToDifyFormat(openaiRes.body, {
      search_count: count,
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

import { supabase } from "@/lib/supabase";

export const maxDuration = 300;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const BATCH_SIZE = 100;

export async function POST() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        // embedding未設定の行を取得
        const { data: rows, error } = await supabase
          .from("qa_knowledge")
          .select("id, question, answer")
          .eq("status", "active")
          .is("embedding", null);

        if (error) {
          send({ event: "error", message: error.message });
          controller.close();
          return;
        }

        if (!rows || rows.length === 0) {
          send({
            event: "complete",
            message: "embeddingが未設定の行はありません",
            total: 0,
            processed: 0,
          });
          controller.close();
          return;
        }

        send({
          event: "start",
          total: rows.length,
          message: `${rows.length}件のembedding生成を開始します`,
        });

        let processed = 0;

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE);

          // テキスト配列を作成
          const texts = batch.map(
            (r) => `${r.question || ""} ${r.answer || ""}`
          );

          // OpenAI Embedding APIを呼び出し
          const embRes = await fetch(
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
            }
          );

          if (!embRes.ok) {
            const errText = await embRes.text();
            send({
              event: "error",
              message: `OpenAI APIエラー: ${errText}`,
              processed,
            });
            controller.close();
            return;
          }

          const embData = await embRes.json();
          const embeddings = embData.data || [];

          // Supabaseに書き込み
          for (let j = 0; j < batch.length; j++) {
            if (j < embeddings.length) {
              const { error: updateError } = await supabase
                .from("qa_knowledge")
                .update({ embedding: embeddings[j].embedding })
                .eq("id", batch[j].id);

              if (updateError) {
                send({
                  event: "warning",
                  message: `ID ${batch[j].id}: 更新失敗 - ${updateError.message}`,
                });
              }
            }
          }

          processed += batch.length;
          send({
            event: "progress",
            processed,
            total: rows.length,
            percentage: Math.round((processed / rows.length) * 100),
          });
        }

        send({
          event: "complete",
          message: "embeddingバックフィル完了",
          total: rows.length,
          processed,
        });
      } catch (err) {
        send({
          event: "error",
          message:
            err instanceof Error ? err.message : "不明なエラーが発生しました",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

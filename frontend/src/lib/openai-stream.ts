/**
 * OpenAIのSSEストリームをDify互換（text_chunk / workflow_finished）に変換
 * /api/chat と /api/analysis で共通利用
 */
export function convertOpenAIStreamToDifyFormat(
  openaiBody: ReadableStream<Uint8Array>,
  metadata: Record<string, unknown> = {}
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullAnswer = "";

  return new ReadableStream({
    async start(controller) {
      const reader = openaiBody.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") continue;
            if (!jsonStr) continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullAnswer += delta;
                const event = JSON.stringify({
                  event: "text_chunk",
                  data: { text: delta },
                });
                controller.enqueue(encoder.encode(`data: ${event}\n\n`));
              }
            } catch {
              // JSON解析エラーはスキップ
            }
          }
        }

        // workflow_finishedイベントを送信
        const finishEvent = JSON.stringify({
          event: "workflow_finished",
          data: {
            outputs: {
              answer: fullAnswer,
              ...metadata,
            },
          },
        });
        controller.enqueue(encoder.encode(`data: ${finishEvent}\n\n`));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * SSEレスポンスヘッダー
 */
export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

/**
 * 固定メッセージをSSEで返す
 */
export function createSSEResponse(
  message: string,
  metadata: Record<string, unknown> = {}
): Response {
  const events = [
    `data: ${JSON.stringify({
      event: "text_chunk",
      data: { text: message },
    })}\n\n`,
    `data: ${JSON.stringify({
      event: "workflow_finished",
      data: {
        outputs: {
          answer: message,
          ...metadata,
        },
      },
    })}\n\n`,
  ];

  const body = new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(new TextEncoder().encode(event));
      }
      controller.close();
    },
  });

  return new Response(body, { headers: SSE_HEADERS });
}

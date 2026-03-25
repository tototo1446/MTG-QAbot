import { NextRequest, NextResponse } from "next/server";
import { runKnowledgePipeline } from "@/lib/knowledge-pipeline";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const text = formData.get("text") as string | null;
    const mtgTitle = formData.get("mtg_title") as string | null;
    const mtgDate = formData.get("mtg_date") as string | null;
    const mode = (formData.get("mode") as string) || "file";

    if (!mtgTitle || !mtgDate) {
      return NextResponse.json(
        { error: "MTGタイトルとMTG日付は必須です" },
        { status: 400 }
      );
    }

    // Extract transcript text
    let transcriptText: string;
    if (mode === "text" && text) {
      transcriptText = text;
    } else if (file) {
      transcriptText = await file.text();
    } else {
      return NextResponse.json(
        { error: "ファイルまたはテキストを入力してください" },
        { status: 400 }
      );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, unknown>) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        };

        // Trigger "processing" step transition on frontend
        send({ event: "file_uploaded" });

        try {
          await runKnowledgePipeline(
            { text: transcriptText, mtgTitle, mtgDate },
            send
          );
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "不明なエラーが発生しました";
          send({ event: "error", data: { message } });
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
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "不明なエラーが発生しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { extractAudio, isMediaFile } from "@/lib/media-preprocessor";
import { GeminiTranscriptionProvider } from "@/lib/transcription";
import { normalizeWhisperDiarized } from "@/lib/transcript-normalizer";

export const maxDuration = 300;

/**
 * 音声/動画ファイルを受け取り、文字起こし+話者分離→NormalizedTranscript を返す
 *
 * リクエスト: multipart/form-data { file: File }
 * レスポンス: SSE ストリーム（progress → result）
 */
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
          send({ event: "error", message: "ファイルが選択されていません" });
          controller.close();
          return;
        }

        if (!isMediaFile(file.name)) {
          send({
            event: "error",
            message:
              "対応していないファイル形式です。音声（mp3, m4a, wav, webm）または動画（mp4, webm, mov）をアップロードしてください",
          });
          controller.close();
          return;
        }

        send({ event: "progress", step: "extracting", message: "音声を抽出中..." });

        // Step 1: 音声抽出（動画の場合はffmpegで変換）
        const fileBuffer = Buffer.from(await file.arrayBuffer());
        const audioBuffer = await extractAudio(fileBuffer, file.name);

        send({
          event: "progress",
          step: "transcribing",
          message: "文字起こし中...",
          audioSize: audioBuffer.length,
        });

        // Step 2: 文字起こし + 話者分離
        const provider = new GeminiTranscriptionProvider();
        const result = await provider.transcribe(audioBuffer, "audio.wav");

        send({
          event: "progress",
          step: "normalizing",
          message: "正規化中...",
          segmentCount: result.segments.length,
        });

        // Step 3: 正規化
        const normalized = normalizeWhisperDiarized(result.segments);

        send({
          event: "result",
          normalizedText: normalized.normalizedText,
          speakers: normalized.speakers,
          segmentCount: normalized.segments.length,
          language: result.language,
          duration: result.duration,
        });
      } catch (err) {
        send({
          event: "error",
          message: err instanceof Error ? err.message : "メディア処理中にエラーが発生しました",
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

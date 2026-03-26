import { NextRequest, NextResponse } from "next/server";
import { isMediaFile } from "@/lib/media-preprocessor";
import { GeminiTranscriptionProvider } from "@/lib/transcription";
import { normalizeWhisperDiarized } from "@/lib/transcript-normalizer";
import { writeFile, readFile, readdir, mkdir, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * メディア処理API
 *
 * 1. FormData (default)                  → 小さいファイル直接文字起こし (SSE)
 * 2. FormData action="upload-part"       → チャンクを /tmp に保存
 * 3. JSON action="transcribe-assembled"  → /tmp のチャンクを結合して文字起こし (SSE)
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  try {
    // JSON: transcribe-assembled
    if (contentType.includes("application/json")) {
      const body = await request.json();
      if (body.action === "transcribe-assembled") {
        return handleTranscribeAssembled(body);
      }
      return NextResponse.json(
        { error: `不明なアクション: ${body.action}` },
        { status: 400 }
      );
    }

    // FormData: upload-part or direct transcribe
    const formData = await request.formData();
    const action = formData.get("action") as string | null;
    if (action === "upload-part") return handleUploadPart(formData);
    return handleDirectTranscribe(formData);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "リクエストの解析に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// UUID形式のバリデーション（パストラバーサル防止）
function isValidSessionId(id: string): boolean {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
    id
  );
}

/**
 * upload-part: クライアントから受け取ったチャンクを /tmp に保存
 */
async function handleUploadPart(formData: FormData) {
  const sessionId = formData.get("sessionId") as string;
  const index = formData.get("index") as string;
  const chunk = formData.get("chunk") as Blob | null;

  if (!sessionId || index === null || !chunk) {
    return NextResponse.json(
      { error: "sessionId, index, chunk は必須です" },
      { status: 400 }
    );
  }

  if (!isValidSessionId(sessionId)) {
    return NextResponse.json(
      { error: "不正なセッションIDです" },
      { status: 400 }
    );
  }

  const sessionDir = join(tmpdir(), `media-upload-${sessionId}`);
  await mkdir(sessionDir, { recursive: true });

  const chunkBuffer = Buffer.from(await chunk.arrayBuffer());
  const paddedIndex = String(index).padStart(5, "0");
  await writeFile(join(sessionDir, `part-${paddedIndex}`), chunkBuffer);

  return NextResponse.json({ ok: true });
}

/**
 * transcribe-assembled: /tmp のチャンクを結合 → Gemini で文字起こし → SSE ストリーム
 */
async function handleTranscribeAssembled(body: {
  sessionId?: string;
  fileName?: string;
  mimeType?: string;
  totalParts?: number;
}) {
  const { sessionId, fileName, mimeType, totalParts } = body;

  if (!sessionId || !fileName || !mimeType || !totalParts) {
    return NextResponse.json(
      { error: "sessionId, fileName, mimeType, totalParts は必須です" },
      { status: 400 }
    );
  }

  if (!isValidSessionId(sessionId)) {
    return NextResponse.json(
      { error: "不正なセッションIDです" },
      { status: 400 }
    );
  }

  const sessionDir = join(tmpdir(), `media-upload-${sessionId}`);

  // チャンクの存在チェック — 不足があれば 409 + 不足インデックスを返す
  let existingFiles: string[] = [];
  try {
    existingFiles = await readdir(sessionDir);
  } catch {
    // ディレクトリが存在しない = チャンクが一つもない
    return NextResponse.json(
      {
        error: "missing_chunks",
        missingIndices: Array.from({ length: totalParts }, (_, i) => i),
      },
      { status: 409 }
    );
  }

  const sortedFiles = existingFiles
    .filter((f) => f.startsWith("part-"))
    .sort();

  if (sortedFiles.length !== totalParts) {
    const presentIndices = new Set(
      sortedFiles.map((f) => parseInt(f.replace("part-", ""), 10))
    );
    const missingIndices: number[] = [];
    for (let i = 0; i < totalParts; i++) {
      if (!presentIndices.has(i)) missingIndices.push(i);
    }
    return NextResponse.json(
      { error: "missing_chunks", missingIndices },
      { status: 409 }
    );
  }

  // 全チャンク揃った — SSE ストリームで処理開始
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        send({
          event: "progress",
          step: "assembling",
          message: "ファイルを組み立て中...",
        });

        const chunks: Buffer[] = [];
        for (const file of sortedFiles) {
          chunks.push(await readFile(join(sessionDir, file)));
        }
        const fileBuffer = Buffer.concat(chunks);

        send({
          event: "progress",
          step: "transcribing",
          message: "文字起こし中...",
          fileSize: fileBuffer.length,
        });

        // Step 2: Gemini で文字起こし
        // gemini-provider が 15MB 超は自動で File API アップロードを行う
        const provider = new GeminiTranscriptionProvider();
        const result = await provider.transcribe(fileBuffer, fileName);

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
          message:
            err instanceof Error
              ? err.message
              : "メディア処理中にエラーが発生しました",
        });
      } finally {
        // /tmp クリーンアップ
        await rm(sessionDir, { recursive: true, force: true }).catch(
          () => {}
        );
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

/**
 * Direct: 小さいファイル（< 4MB）を FormData で受け取り直接文字起こし
 */
function handleDirectTranscribe(formData: FormData) {
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json(
      { error: "ファイルが選択されていません" },
      { status: 400 }
    );
  }

  if (!isMediaFile(file.name)) {
    return NextResponse.json(
      {
        error:
          "対応していないファイル形式です。音声（mp3, m4a, wav, webm）または動画（mp4, webm, mov）をアップロードしてください",
      },
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

      try {
        send({
          event: "progress",
          step: "preparing",
          message: "ファイルを準備中...",
        });

        const fileBuffer = Buffer.from(await file.arrayBuffer());

        send({
          event: "progress",
          step: "transcribing",
          message: "文字起こし中...",
          fileSize: fileBuffer.length,
        });

        const provider = new GeminiTranscriptionProvider();
        const result = await provider.transcribe(fileBuffer, file.name);

        send({
          event: "progress",
          step: "normalizing",
          message: "正規化中...",
          segmentCount: result.segments.length,
        });

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
          message:
            err instanceof Error
              ? err.message
              : "メディア処理中にエラーが発生しました",
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

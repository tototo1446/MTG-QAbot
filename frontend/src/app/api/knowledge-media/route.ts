import { NextRequest, NextResponse } from "next/server";
import { isMediaFile } from "@/lib/media-preprocessor";
import { GeminiTranscriptionProvider } from "@/lib/transcription";
import { normalizeWhisperDiarized } from "@/lib/transcript-normalizer";

export const runtime = "nodejs";
export const maxDuration = 300;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

/**
 * メディア処理API — 4つのアクションを処理:
 *
 * 1. FormData (default)        → 小さいファイルの直接文字起こし (SSE)
 * 2. JSON action="init"        → Gemini File API resumable upload 開始
 * 3. FormData action="upload-chunk" → チャンクを Gemini へプロキシ
 * 4. JSON action="transcribe"  → fileUri から文字起こし (SSE)
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  try {
    // JSON: init or transcribe
    if (contentType.includes("application/json")) {
      const body = await request.json();
      if (body.action === "init") return handleInit(body);
      if (body.action === "transcribe") return handleTranscribe(body);
      return NextResponse.json(
        { error: `不明なアクション: ${body.action}` },
        { status: 400 }
      );
    }

    // FormData: direct upload or chunk upload
    const formData = await request.formData();
    const action = formData.get("action") as string | null;
    if (action === "upload-chunk") return handleUploadChunk(formData);
    return handleDirectTranscribe(formData);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "リクエストの解析に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Init: Gemini File API の resumable upload を開始し uploadUrl を返す
 */
async function handleInit(body: {
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY が未設定です" },
      { status: 500 }
    );
  }

  const { fileName, fileSize, mimeType } = body;
  if (!fileName || !fileSize || !mimeType) {
    return NextResponse.json(
      { error: "fileName, fileSize, mimeType は必須です" },
      { status: 400 }
    );
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(fileSize),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file: { displayName: fileName } }),
    }
  );

  const uploadUrl = res.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) {
    const error = await res.text();
    return NextResponse.json(
      { error: `Gemini File API のアップロードURL取得に失敗: ${error}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ uploadUrl });
}

/**
 * Upload-chunk: クライアントから受け取ったチャンクを Gemini File API へプロキシ
 */
async function handleUploadChunk(formData: FormData) {
  const uploadUrl = formData.get("uploadUrl") as string;
  const chunk = formData.get("chunk") as Blob | null;
  const offset = formData.get("offset") as string;
  const isLast = formData.get("isLast") === "true";

  if (!uploadUrl || !chunk) {
    return NextResponse.json(
      { error: "uploadUrl と chunk は必須です" },
      { status: 400 }
    );
  }

  const chunkBuffer = new Uint8Array(await chunk.arrayBuffer());

  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "X-Goog-Upload-Command": isLast ? "upload, finalize" : "upload",
      "X-Goog-Upload-Offset": offset || "0",
      "Content-Length": String(chunkBuffer.length),
    },
    body: chunkBuffer,
  });

  if (!isLast) {
    if (!res.ok) {
      const error = await res.text();
      return NextResponse.json(
        { error: `チャンクアップロード失敗: ${error}` },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  // 最終チャンク: ファイル情報を取得
  if (!res.ok) {
    const error = await res.text();
    return NextResponse.json(
      { error: `ファイナライズ失敗: ${error}` },
      { status: 502 }
    );
  }

  const fileInfo = await res.json();
  const fileUri = fileInfo.file?.uri;
  if (!fileUri) {
    return NextResponse.json(
      { error: "ファイルURIの取得に失敗しました" },
      { status: 502 }
    );
  }

  return NextResponse.json({ fileUri, fileName: fileInfo.file?.name });
}

/**
 * Transcribe: アップロード済み fileUri から文字起こし → SSE ストリーム
 */
function handleTranscribe(body: { fileUri?: string; mimeType?: string }) {
  const { fileUri, mimeType } = body;
  if (!fileUri || !mimeType) {
    return NextResponse.json(
      { error: "fileUri と mimeType は必須です" },
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
          step: "transcribing",
          message: "文字起こし中...",
        });

        const provider = new GeminiTranscriptionProvider();
        const result = await provider.transcribeFromUri(fileUri, mimeType);

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
              : "文字起こし中にエラーが発生しました",
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

/**
 * Direct: 小さいファイルを FormData で受け取り直接文字起こし → SSE ストリーム
 * FFmpeg 不要 — Gemini API がメディアファイルをネイティブサポート
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

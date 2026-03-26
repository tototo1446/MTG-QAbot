"use client";

import { useState, useCallback } from "react";
import type { UploadStep, KnowledgeInputMode } from "@/types";

interface UploadResult {
  chunkCount?: number;
  qaCount?: number;
  results?: string;
}

export function useKnowledgeUpload() {
  const [step, setStep] = useState<UploadStep>("idle");
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<UploadResult>();
  const [nodeStatus, setNodeStatus] = useState<string>("");
  const [errorAtStep, setErrorAtStep] = useState<"uploading" | "processing">();
  const [failedNode, setFailedNode] = useState<string>();

  const upload = useCallback(
    async (
      input: File | string,
      mtgTitle: string,
      mtgDate: string,
      mode: KnowledgeInputMode = "file"
    ) => {
      setStep("uploading");
      setError(undefined);
      setResult(undefined);
      setNodeStatus("");
      setErrorAtStep(undefined);
      setFailedNode(undefined);

      let activeStep: "uploading" | "processing" = "uploading";
      let lastFailedNodeTitle: string | undefined;
      let lastFailedNodeError: string | undefined;

      try {
        let normalizedText: string | null = null;

        // メディアモード: まず文字起こしAPIを呼ぶ
        if (mode === "media" && input instanceof File) {
          setNodeStatus("音声/動画を処理中...");
          normalizedText = await transcribeMedia(input, (msg) =>
            setNodeStatus(msg)
          );
        }

        // ナレッジ蓄積APIにPOST
        const formData = new FormData();
        formData.append("mtg_title", mtgTitle);
        formData.append("mtg_date", mtgDate);

        if (mode === "file" && input instanceof File) {
          formData.append("mode", "file");
          formData.append("file", input);
        } else if (mode === "text" && typeof input === "string") {
          formData.append("mode", "text");
          formData.append("text", input);
        } else if (mode === "media" && normalizedText) {
          formData.append("mode", "text"); // メディアは文字起こし済みテキストとして送る
          formData.append("text", normalizedText);
        }

        const res = await fetch("/api/knowledge", {
          method: "POST",
          body: formData,
        });

        // JSONエラーレスポンスの場合
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await res.json();
          throw new Error(data.error || "アップロードに失敗しました");
        }

        if (!res.ok || !res.body) {
          throw new Error("ストリームの取得に失敗しました");
        }

        // SSEストリームを読み取り
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            let event;
            try {
              event = JSON.parse(line.slice(6));
            } catch {
              continue;
            }

            if (event.event === "file_uploaded") {
              activeStep = "processing";
              setStep("processing");
              setNodeStatus("ワークフロー開始中...");
            } else if (event.event === "node_finished") {
              if (event.data?.status === "failed") {
                lastFailedNodeTitle = (event.data?.title as string) || undefined;
                lastFailedNodeError = (event.data?.error as string) || undefined;
              }
            } else if (event.event === "node_started") {
              setNodeStatus(event.data?.title || "処理中...");
            } else if (event.event === "workflow_finished") {
              if (event.data?.status === "succeeded") {
                setResult({
                  chunkCount: event.data?.outputs?.chunk_count,
                  qaCount: event.data?.outputs?.qa_count,
                  results: event.data?.outputs?.results,
                });
                setNodeStatus("");
                setStep("completed");
              } else {
                if (lastFailedNodeTitle) {
                  setFailedNode(lastFailedNodeTitle);
                }
                const baseMsg = event.data?.error || "ワークフローが失敗しました";
                const detail = lastFailedNodeTitle
                  ? `ノード「${lastFailedNodeTitle}」で失敗しました${lastFailedNodeError ? `: ${lastFailedNodeError}` : ""}`
                  : baseMsg;
                throw new Error(detail as string);
              }
            } else if (event.event === "error") {
              throw new Error(
                event.data?.message ||
                  event.message ||
                  "ワークフローでエラーが発生しました"
              );
            }
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "不明なエラーが発生しました"
        );
        setErrorAtStep(activeStep);
        setStep("error");
        setNodeStatus("");
      }
    },
    []
  );

  const reset = useCallback(() => {
    setStep("idle");
    setError(undefined);
    setResult(undefined);
    setNodeStatus("");
    setErrorAtStep(undefined);
    setFailedNode(undefined);
  }, []);

  return { step, error, result, nodeStatus, errorAtStep, failedNode, upload, reset };
}

const CHUNK_SIZE = 3 * 1024 * 1024; // 3MB per chunk（Vercel 4.5MB body制限内）
const SIZE_THRESHOLD = 4 * 1024 * 1024; // 4MB — Vercel body size limit対策

/**
 * メディアファイルを文字起こし
 * 小さいファイルは直接送信、大きいファイルはチャンクアップロード
 */
async function transcribeMedia(
  file: File,
  onProgress: (msg: string) => void
): Promise<string> {
  if (file.size < SIZE_THRESHOLD) {
    return transcribeMediaDirect(file, onProgress);
  }
  return transcribeMediaChunked(file, onProgress);
}

/**
 * 小さいファイル（< 4MB）: FormDataで直接送信
 */
async function transcribeMediaDirect(
  file: File,
  onProgress: (msg: string) => void
): Promise<string> {
  onProgress("ファイルをアップロード中...");

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/knowledge-media", {
    method: "POST",
    body: formData,
  });

  if (!res.ok || !res.body) {
    const errorText = await res.text().catch(() => "");
    throw new Error(
      `メディア処理APIの呼び出しに失敗しました (${res.status}): ${errorText || res.statusText}`
    );
  }

  return readSSEResult(res.body, onProgress);
}

/**
 * 大きいファイル（>= 4MB）: サーバーの /tmp にチャンク蓄積 → 結合して文字起こし
 * 1. 3MBチャンクに分割してサーバーへ順次送信（Vercel body制限内）
 * 2. 全チャンク送信後、サーバー側で結合 → Gemini 文字起こし
 */
async function transcribeMediaChunked(
  file: File,
  onProgress: (msg: string) => void
): Promise<string> {
  const sessionId = crypto.randomUUID();
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  // Step 1: チャンクをサーバーへ送信
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    onProgress(`アップロード中... (${i + 1}/${totalChunks})`);

    const formData = new FormData();
    formData.append("action", "upload-part");
    formData.append("sessionId", sessionId);
    formData.append("index", String(i));
    formData.append("chunk", chunk);

    const res = await fetch("/api/knowledge-media", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const errorData = await res
        .json()
        .catch(() => ({ error: res.statusText }));
      throw new Error(
        `チャンクアップロード失敗 (${i + 1}/${totalChunks}): ${errorData.error}`
      );
    }
  }

  // Step 2: サーバーでチャンク結合 + 文字起こし
  onProgress("文字起こし中...");
  const mimeType = file.type || getMediaMimeType(file.name);
  const transcribeRes = await fetch("/api/knowledge-media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "transcribe-assembled",
      sessionId,
      fileName: file.name,
      mimeType,
      totalParts: totalChunks,
    }),
  });

  if (!transcribeRes.ok || !transcribeRes.body) {
    const errorText = await transcribeRes.text().catch(() => "");
    throw new Error(
      `文字起こしAPI呼び出し失敗 (${transcribeRes.status}): ${errorText || transcribeRes.statusText}`
    );
  }

  return readSSEResult(transcribeRes.body, onProgress);
}

/**
 * SSEストリームを読み取り、normalizedTextを返す
 */
async function readSSEResult(
  body: ReadableStream<Uint8Array>,
  onProgress: (msg: string) => void
): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let normalizedText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;

      let event;
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        continue;
      }

      if (event.event === "progress") {
        onProgress(event.message || "処理中...");
      } else if (event.event === "result") {
        normalizedText = event.normalizedText;
      } else if (event.event === "error") {
        throw new Error(event.message || "メディア処理エラー");
      }
    }
  }

  if (!normalizedText) {
    throw new Error("文字起こし結果が空です");
  }

  return normalizedText;
}

/**
 * ファイル名からMIMEタイプを推定（File.typeが空の場合のフォールバック）
 */
function getMediaMimeType(fileName: string): string {
  const ext = fileName.substring(fileName.lastIndexOf(".")).toLowerCase();
  const types: Record<string, string> = {
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
  };
  return types[ext] || "application/octet-stream";
}

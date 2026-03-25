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

/**
 * メディアファイルをapi/knowledge-mediaに送って文字起こし結果を取得
 */
async function transcribeMedia(
  file: File,
  onProgress: (msg: string) => void
): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/knowledge-media", {
    method: "POST",
    body: formData,
  });

  if (!res.ok || !res.body) {
    throw new Error("メディア処理APIの呼び出しに失敗しました");
  }

  const reader = res.body.getReader();
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
        continue; // JSONパース失敗は無視
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

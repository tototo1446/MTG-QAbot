"use client";

import { useState, useCallback, useRef } from "react";

export function useAnalysis() {
  const [content, setContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const analyze = useCallback(
    async (startDate: string, endDate: string, project?: string) => {
      setContent("");
      setError(null);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const body: Record<string, string> = { startDate, endDate };
        if (project) body.project = project;

        const res = await fetch("/api/analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "分析に失敗しました");
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("ストリームの読み取りに失敗しました");

        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);
              if (event.event === "text_chunk") {
                fullContent += event.data?.text || "";
                setContent(fullContent);
              }
            } catch {
              // JSON解析エラーはスキップ
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "分析中にエラーが発生しました"
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    []
  );

  const cancel = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  return { content, isStreaming, error, analyze, cancel };
}

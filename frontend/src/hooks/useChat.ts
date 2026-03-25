"use client";

import { useState, useCallback, useRef } from "react";
import type { ChatMessage } from "@/types";

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [project, setProject] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (question: string) => {
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      timestamp: new Date(),
    };

    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const body: Record<string, string> = { question };
      if (project) body.project = project;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "エラーが発生しました");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("ストリームの読み取りに失敗しました");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullAnswer = "";
      let searchCount: number | undefined;

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
              const text = event.data?.text || "";
              fullAnswer += text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullAnswer } : m
                )
              );
            }

            if (event.event === "workflow_finished") {
              const outputs = event.data?.outputs;
              if (outputs?.answer && !fullAnswer) {
                fullAnswer = outputs.answer;
              }
              if (outputs?.search_count !== undefined) {
                searchCount = Number(outputs.search_count);
              }
              // 最終結果を反映
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: fullAnswer || outputs?.answer || "", searchCount }
                    : m
                )
              );
            }
          } catch {
            // JSON解析エラーはスキップ
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;

      const errorMessage = err instanceof Error ? err.message : "エラーが発生しました";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: `エラー: ${errorMessage}` } : m
        )
      );
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [project]);

  const clearMessages = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, sendMessage, clearMessages, project, setProject };
}

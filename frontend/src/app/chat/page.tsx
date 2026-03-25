"use client";

import { useState, useEffect } from "react";
import ChatContainer from "@/components/chat/ChatContainer";
import ChatInput from "@/components/chat/ChatInput";
import Button from "@/components/ui/Button";
import { useChat } from "@/hooks/useChat";
import { MessageCircle, Trash2, Filter } from "lucide-react";

const SUGGESTED_QUESTIONS = [
  "直近のMTGで決まったことは？",
  "今後のアクションアイテムは？",
  "プロジェクトの進捗状況は？",
];

export default function ChatPage() {
  const { messages, isStreaming, sendMessage, clearMessages, project, setProject } = useChat();
  const [projects, setProjects] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* ヘッダー */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 lg:px-6 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
            <MessageCircle size={18} />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900 dark:text-white">
              Q&A チャット
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              ナレッジベースに質問する
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* プロジェクトフィルター */}
          {projects.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Filter size={14} className="text-gray-400" />
              <select
                value={project}
                onChange={(e) => setProject(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300"
              >
                <option value="">全プロジェクト</option>
                {projects.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          )}
          {messages.length > 0 && (
            <Button
              onClick={clearMessages}
              variant="ghost"
              size="sm"
              disabled={isStreaming}
            >
              <Trash2 size={14} />
              クリア
            </Button>
          )}
        </div>
      </div>

      {/* サジェスト質問 */}
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2 px-4 pt-4 lg:px-6 justify-center">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:border-indigo-600 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-300"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* チャットエリア */}
      <ChatContainer messages={messages} isStreaming={isStreaming} />

      {/* 入力 */}
      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}

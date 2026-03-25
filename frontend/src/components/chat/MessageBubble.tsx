"use client";

import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { User, Bot, Search } from "lucide-react";
import Badge from "@/components/ui/Badge";
import type { ChatMessage } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export default function MessageBubble({ message, isStreaming }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex gap-3 animate-fade-in",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {/* アシスタントアバター */}
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 mt-1">
          <Bot size={16} />
        </div>
      )}

      <div
        className={cn("max-w-[80%] space-y-2", isUser ? "items-end" : "items-start")}
      >
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm",
            isUser
              ? "bg-indigo-600 text-white rounded-br-md"
              : "bg-white border border-gray-200 text-gray-800 rounded-bl-md dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : message.content ? (
            <div className="prose-chat">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          ) : isStreaming ? (
            <div className="flex items-center gap-1.5 py-1">
              <div className="streaming-dot h-2 w-2 rounded-full bg-indigo-400" />
              <div className="streaming-dot h-2 w-2 rounded-full bg-indigo-400" />
              <div className="streaming-dot h-2 w-2 rounded-full bg-indigo-400" />
            </div>
          ) : null}
        </div>

        {/* 検索結果バッジ */}
        {!isUser && message.searchCount !== undefined && (
          <div className="flex items-center gap-1">
            <Badge variant="default">
              <Search size={12} />
              {message.searchCount}件のナレッジを参照
            </Badge>
          </div>
        )}
      </div>

      {/* ユーザーアバター */}
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 mt-1">
          <User size={16} />
        </div>
      )}
    </div>
  );
}

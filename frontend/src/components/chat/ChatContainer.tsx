"use client";

import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import type { ChatMessage } from "@/types";
import { MessageCircle } from "lucide-react";

interface ChatContainerProps {
  messages: ChatMessage[];
  isStreaming: boolean;
}

export default function ChatContainer({ messages, isStreaming }: ChatContainerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 mb-4">
          <MessageCircle size={32} />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          ナレッジに質問しよう
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
          蓄積されたMTGナレッジに対して質問できます。AIがリアルタイムで回答します。
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            isStreaming={
              isStreaming &&
              message.role === "assistant" &&
              index === messages.length - 1
            }
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

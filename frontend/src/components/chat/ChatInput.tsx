"use client";

import { useState, useRef, useCallback } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  return (
    <div className="border-t border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-xl border border-gray-300 bg-white p-2 transition-colors focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-800 dark:focus-within:border-indigo-500">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="質問を入力してください..."
            disabled={disabled}
            rows={1}
            className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder:text-gray-500 disabled:opacity-50"
          />
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || disabled}
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
              value.trim() && !disabled
                ? "bg-indigo-600 text-white hover:bg-indigo-700"
                : "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500"
            )}
          >
            <Send size={16} />
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-gray-400 dark:text-gray-500">
          Enter で送信 / Shift+Enter で改行
        </p>
      </div>
    </div>
  );
}

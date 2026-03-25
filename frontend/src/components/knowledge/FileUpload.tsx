"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Upload, FileText, Music, Video, X } from "lucide-react";

export type FileUploadMode = "document" | "media";

interface FileUploadProps {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  disabled?: boolean;
  mode?: FileUploadMode;
}

const DOCUMENT_TYPES = [".txt", ".md"];
const MEDIA_TYPES = [".mp3", ".m4a", ".wav", ".webm", ".mp4", ".mov"];

function getAcceptedTypes(mode: FileUploadMode) {
  return mode === "media" ? MEDIA_TYPES : DOCUMENT_TYPES;
}

function getAcceptString(mode: FileUploadMode) {
  return mode === "media"
    ? ".mp3,.m4a,.wav,.webm,.mp4,.mov"
    : ".txt,.md";
}

function getHintText(mode: FileUploadMode) {
  return mode === "media"
    ? "音声（mp3, m4a, wav）/ 動画（mp4, webm, mov）"
    : ".txt / .md";
}

function getFileIcon(filename: string) {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  if ([".mp3", ".m4a", ".wav", ".ogg"].includes(ext)) return Music;
  if ([".mp4", ".webm", ".mov", ".avi", ".mkv"].includes(ext)) return Video;
  return FileText;
}

export default function FileUpload({
  file,
  onFileSelect,
  disabled,
  mode = "document",
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const acceptedTypes = getAcceptedTypes(mode);

  const handleFile = useCallback(
    (f: File) => {
      const ext = f.name.substring(f.name.lastIndexOf(".")).toLowerCase();
      if (!acceptedTypes.includes(ext)) {
        alert(`対応しているファイル形式は ${acceptedTypes.join(", ")} です`);
        return;
      }
      onFileSelect(f);
    },
    [onFileSelect, acceptedTypes]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile, disabled]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) handleFile(f);
      e.target.value = "";
    },
    [handleFile]
  );

  if (file) {
    const Icon = getFileIcon(file.name);
    const sizeLabel =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${(file.size / 1024).toFixed(1)} KB`;

    return (
      <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-800 dark:bg-indigo-900/20">
        <Icon
          size={20}
          className="text-indigo-600 dark:text-indigo-400 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {file.name}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {sizeLabel}
          </p>
        </div>
        {!disabled && (
          <button
            onClick={() => onFileSelect(null)}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <X size={16} />
          </button>
        )}
      </div>
    );
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors duration-200",
        isDragging
          ? "border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-900/20"
          : "border-gray-300 hover:border-indigo-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:border-indigo-600 dark:hover:bg-gray-800/50",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
        <Upload size={24} />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          ファイルをドラッグ&ドロップ
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          または
          <span className="text-indigo-600 dark:text-indigo-400 font-medium">
            クリックして選択
          </span>
          （{getHintText(mode)}）
        </p>
      </div>
      <input
        type="file"
        accept={getAcceptString(mode)}
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
      />
    </label>
  );
}

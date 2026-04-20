"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Upload } from "lucide-react";

export type MultiFileMode = "document" | "media";

interface MultiFileDropzoneProps {
  onFilesAdd: (files: File[]) => void;
  disabled?: boolean;
  mode?: MultiFileMode;
}

const DOCUMENT_TYPES = [".txt", ".md"];
const MEDIA_TYPES = [".mp3", ".m4a", ".wav", ".webm", ".mp4", ".mov"];

function getAcceptedTypes(mode: MultiFileMode) {
  return mode === "media" ? MEDIA_TYPES : DOCUMENT_TYPES;
}

function getAcceptString(mode: MultiFileMode) {
  return getAcceptedTypes(mode).join(",");
}

function getHintText(mode: MultiFileMode) {
  return mode === "media"
    ? "音声（mp3, m4a, wav）/ 動画（mp4, webm, mov）"
    : ".txt / .md";
}

export default function MultiFileDropzone({
  onFilesAdd,
  disabled,
  mode = "document",
}: MultiFileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const acceptedTypes = getAcceptedTypes(mode);

  const filterFiles = useCallback(
    (files: File[]) => {
      const valid: File[] = [];
      const invalid: string[] = [];
      for (const f of files) {
        const ext = f.name.substring(f.name.lastIndexOf(".")).toLowerCase();
        if (acceptedTypes.includes(ext)) valid.push(f);
        else invalid.push(f.name);
      }
      if (invalid.length > 0) {
        alert(
          `対応していないファイルがあります: ${invalid.join(", ")}\n対応形式: ${acceptedTypes.join(", ")}`
        );
      }
      return valid;
    },
    [acceptedTypes]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files || []);
      const valid = filterFiles(files);
      if (valid.length > 0) onFilesAdd(valid);
    },
    [disabled, filterFiles, onFilesAdd]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      const valid = filterFiles(files);
      if (valid.length > 0) onFilesAdd(valid);
      e.target.value = "";
    },
    [filterFiles, onFilesAdd]
  );

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors duration-200",
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
          ファイルをドラッグ&ドロップ（複数選択可）
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          または
          <span className="text-indigo-600 dark:text-indigo-400 font-medium">
            {" "}クリックして選択{" "}
          </span>
          （{getHintText(mode)}）
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          最大10並列で処理されます
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={getAcceptString(mode)}
        onChange={handleChange}
        disabled={disabled}
        className="hidden"
      />
    </label>
  );
}

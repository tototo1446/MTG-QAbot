"use client";

import { cn } from "@/lib/utils";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  Music,
  Video,
  X,
} from "lucide-react";
import type { KnowledgeJob } from "@/hooks/useKnowledgeJobs";
import type { QADataRow } from "@/lib/knowledge-uploader";

interface JobCardProps {
  job: KnowledgeJob;
  onRemove: (id: string) => void;
  onTitleChange: (id: string, value: string) => void;
  onDateChange: (id: string, value: string) => void;
  onTextChange?: (id: string, value: string) => void;
  disabled?: boolean;
}

function renderFileIcon(filename: string, size = 16) {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  if ([".mp3", ".m4a", ".wav", ".ogg"].includes(ext)) return <Music size={size} />;
  if ([".mp4", ".webm", ".mov", ".avi", ".mkv"].includes(ext))
    return <Video size={size} />;
  return <FileText size={size} />;
}

function formatSize(size: number) {
  if (size > 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / 1024).toFixed(1)} KB`;
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCsv(qaData: QADataRow[]) {
  if (!qaData || qaData.length === 0) return;

  const headers = [
    "MTGタイトル",
    "MTG日付",
    "トピック",
    "時間帯",
    "質問",
    "回答",
    "固定タグ",
    "自由タグ",
    "話者",
    "プロジェクト",
  ];
  const csvRows = [
    headers.join(","),
    ...qaData.map((row) =>
      [
        row.mtg_title,
        row.mtg_date,
        row.topic,
        row.time_range,
        row.question,
        row.answer,
        row.fixed_tags,
        row.free_tags,
        row.speaker,
        row.project,
      ]
        .map(escapeCsvField)
        .join(",")
    ),
  ];

  const bom = "\uFEFF";
  const blob = new Blob([bom + csvRows.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `QA_${qaData[0].mtg_title}_${qaData[0].mtg_date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function JobCard({
  job,
  onRemove,
  onTitleChange,
  onDateChange,
  onTextChange,
  disabled,
}: JobCardProps) {
  const isActive = job.step === "uploading" || job.step === "processing";
  const isDone = job.step === "completed";
  const isError = job.step === "error";
  const isIdle = job.step === "idle";

  const statusLabel = (() => {
    if (isIdle) return "待機中";
    if (job.step === "uploading") return "アップロード中";
    if (job.step === "processing") return job.nodeStatus || "処理中";
    if (isDone) return "完了";
    if (isError) return "失敗";
    return "";
  })();

  const progressPct =
    job.step === "uploading"
      ? 33
      : job.step === "processing"
      ? 66
      : job.step === "completed"
      ? 100
      : job.step === "error"
      ? job.errorAtStep === "uploading"
        ? 33
        : 66
      : 0;

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        isError
          ? "border-red-200 bg-red-50/60 dark:border-red-800/60 dark:bg-red-900/10"
          : isDone
          ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/60 dark:bg-emerald-900/10"
          : isActive
          ? "border-indigo-200 bg-indigo-50/60 dark:border-indigo-800/60 dark:bg-indigo-900/10"
          : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/50"
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            isError
              ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
              : isDone
              ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
              : isActive
              ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
              : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
          )}
        >
          {isActive ? (
            <Loader2 size={16} className="animate-spin" />
          ) : isDone ? (
            <CheckCircle2 size={16} />
          ) : isError ? (
            <AlertCircle size={16} />
          ) : isIdle ? (
            <Clock size={16} />
          ) : job.kind === "file" ? (
            renderFileIcon(job.file.name)
          ) : (
            <FileText size={16} />
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate flex-1">
              {job.kind === "file" ? job.file.name : job.title}
            </p>
            {job.kind === "file" && (
              <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                {formatSize(job.file.size)}
              </span>
            )}
          </div>

          {isIdle && !disabled && (
            <>
              {job.kind === "text" && onTextChange && (
                <textarea
                  value={job.text}
                  onChange={(e) => onTextChange(job.id, e.target.value)}
                  placeholder={
                    "MTGの議事録やメモをここに貼り付けてください...\n\n例:\n0:00 田中: 今日は企画会議です\n0:15 鈴木: 新しい動画のネタについて話しましょう"
                  }
                  className="w-full rounded-md border border-gray-300 bg-white p-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  rows={6}
                />
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
                <input
                  type="text"
                  value={job.title}
                  onChange={(e) => onTitleChange(job.id, e.target.value)}
                  placeholder="MTGタイトル"
                  className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
                <input
                  type="date"
                  value={job.date}
                  onChange={(e) => onDateChange(job.id, e.target.value)}
                  className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
            </>
          )}

          {!isIdle && (
            <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
              {job.title} ・ {job.date}
            </p>
          )}

          {(isActive || isDone || isError) && (
            <div className="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  isError
                    ? "bg-red-500"
                    : isDone
                    ? "bg-emerald-500"
                    : "bg-gradient-to-r from-indigo-500 to-purple-500"
                )}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}

          {statusLabel && (
            <p
              className={cn(
                "text-xs",
                isError
                  ? "text-red-600 dark:text-red-400"
                  : isDone
                  ? "text-emerald-600 dark:text-emerald-400"
                  : isActive
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-gray-500 dark:text-gray-400"
              )}
            >
              {statusLabel}
            </p>
          )}

          {isError && job.error && (
            <p className="text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap break-words">
              {job.error}
              {job.failedNode ? `（ノード: ${job.failedNode}）` : ""}
            </p>
          )}

          {isDone && job.result && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-emerald-700 dark:text-emerald-300">
              {job.result.chunkCount !== undefined && (
                <span>チャンク: {job.result.chunkCount}</span>
              )}
              {job.result.qaCount !== undefined && (
                <span>QA: {job.result.qaCount}</span>
              )}
              {job.result.qaData && job.result.qaData.length > 0 && (
                <button
                  onClick={() => downloadCsv(job.result!.qaData!)}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-1 font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                >
                  <Download size={12} />
                  CSV
                </button>
              )}
            </div>
          )}
        </div>

        {!isActive && (
          <button
            onClick={() => onRemove(job.id)}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300 shrink-0"
            aria-label="ジョブを削除"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

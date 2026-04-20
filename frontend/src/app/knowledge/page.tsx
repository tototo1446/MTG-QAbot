"use client";

import { useState } from "react";
import MultiFileDropzone from "@/components/knowledge/MultiFileDropzone";
import JobCard from "@/components/knowledge/JobCard";
import MetadataForm from "@/components/knowledge/MetadataForm";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import {
  useKnowledgeJobs,
  MAX_TEXT_SLOTS,
} from "@/hooks/useKnowledgeJobs";
import {
  Database,
  RotateCcw,
  FileText,
  Type,
  Mic,
  Play,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { KnowledgeInputMode } from "@/types";

const INPUT_MODES: {
  key: KnowledgeInputMode;
  label: string;
  icon: typeof FileText;
}[] = [
  { key: "file", label: "テキストファイル", icon: FileText },
  { key: "text", label: "テキスト入力", icon: Type },
  { key: "media", label: "音声 / 動画", icon: Mic },
];

export default function KnowledgePage() {
  const [inputMode, setInputMode] = useState<KnowledgeInputMode>("file");
  const [mtgTitle, setMtgTitle] = useState("");
  const [mtgDate, setMtgDate] = useState("");

  const {
    jobs,
    isRunning,
    addFiles,
    addTextJob,
    updateText,
    removeJob,
    updateTitle,
    updateDate,
    runAll,
    clearCompleted,
    resetAll,
  } = useKnowledgeJobs();

  const fileJobs = jobs.filter((j) => j.kind === "file");
  const textJobs = jobs.filter((j) => j.kind === "text");
  const visibleJobs =
    inputMode === "text"
      ? textJobs
      : fileJobs.filter((j) =>
          inputMode === "media" ? j.mode === "media" : j.mode === "file"
        );

  const pendingRunnable = visibleJobs.filter((j) => {
    if (j.step !== "idle" && j.step !== "error") return false;
    if (j.kind === "text") return j.text.trim().length > 10;
    return true;
  });
  const completedJobCount = visibleJobs.filter(
    (j) => j.step === "completed" || j.step === "error"
  ).length;

  const handleAddFiles = (files: File[]) => {
    if (inputMode !== "file" && inputMode !== "media") return;
    addFiles(files, inputMode, mtgTitle, mtgDate);
  };

  const handleAddTextSlot = () => {
    if (textJobs.length >= MAX_TEXT_SLOTS) return;
    addTextJob(mtgTitle, mtgDate);
  };

  const handleModeChange = (mode: KnowledgeInputMode) => {
    if (isRunning) return;
    setInputMode(mode);
  };

  return (
    <div className="p-6 lg:p-10 max-w-3xl mx-auto">
      <div className="animate-fade-in mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
            <Database size={22} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            ナレッジ蓄積
          </h1>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 ml-[52px]">
          MTG議事録をアップロードして、ナレッジベースに蓄積します（最大10並列）
        </p>
      </div>

      <div className="space-y-6">
        {/* 入力モード切替タブ */}
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800/50">
          {INPUT_MODES.map((mode) => (
            <button
              key={mode.key}
              onClick={() => handleModeChange(mode.key)}
              disabled={isRunning}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all",
                inputMode === mode.key
                  ? "bg-white text-indigo-700 shadow-sm dark:bg-gray-700 dark:text-indigo-300"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
                isRunning && "opacity-50 cursor-not-allowed"
              )}
            >
              <mode.icon size={16} />
              <span className="hidden sm:inline">{mode.label}</span>
            </button>
          ))}
        </div>

        {/* 共通メタデータ（既定値） */}
        <Card className="animate-fade-in" style={{ animationDelay: "0.05s" }}>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
            MTG情報（既定値）
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            未入力の場合、
            {inputMode === "text"
              ? "テキスト入力_日付_時刻 が自動で使われます。"
              : "ファイル名＋本日の日付が自動で使われます。"}
            {" 各ジョブ単位で個別に編集可能です。"}
            {inputMode !== "text" && (
              <>
                <br />
                複数ファイル投入時はキー衝突防止のため自動でユニーク化されます。
              </>
            )}
          </p>
          <MetadataForm
            title={mtgTitle}
            date={mtgDate}
            onTitleChange={setMtgTitle}
            onDateChange={setMtgDate}
            disabled={isRunning}
          />
        </Card>

        {/* 入力エリア */}
        {(inputMode === "file" || inputMode === "media") && (
          <Card className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              {inputMode === "file"
                ? "テキストファイル"
                : "音声 / 動画ファイル"}
            </h2>
            <MultiFileDropzone
              onFilesAdd={handleAddFiles}
              disabled={isRunning}
              mode={inputMode === "media" ? "media" : "document"}
            />
            {inputMode === "media" && (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                音声/動画ファイルはAIで文字起こし（話者分離付き）→ナレッジ変換の順に処理されます。
              </p>
            )}
          </Card>
        )}

        {/* ジョブリスト */}
        {visibleJobs.length > 0 && (
          <Card className="animate-fade-in" style={{ animationDelay: "0.15s" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                ジョブ ({visibleJobs.length}
                {inputMode === "text" ? ` / ${MAX_TEXT_SLOTS}` : ""})
              </h2>
              {completedJobCount > 0 && !isRunning && (
                <button
                  onClick={() =>
                    clearCompleted(visibleJobs.map((j) => j.id))
                  }
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  完了/失敗をクリア
                </button>
              )}
            </div>
            <div className="space-y-3">
              {visibleJobs.map((job) => (
                <JobCard
                  key={job.id}
                  job={job}
                  onRemove={removeJob}
                  onTitleChange={updateTitle}
                  onDateChange={updateDate}
                  onTextChange={updateText}
                  disabled={isRunning}
                />
              ))}
            </div>
          </Card>
        )}

        {/* テキストモードの+ボタン */}
        {inputMode === "text" && (
          <button
            onClick={handleAddTextSlot}
            disabled={isRunning || textJobs.length >= MAX_TEXT_SLOTS}
            className={cn(
              "w-full rounded-xl border-2 border-dashed p-6 text-sm font-medium transition-all",
              "flex items-center justify-center gap-2",
              textJobs.length >= MAX_TEXT_SLOTS
                ? "border-gray-200 text-gray-400 cursor-not-allowed dark:border-gray-700 dark:text-gray-600"
                : "border-gray-300 text-gray-600 hover:border-indigo-300 hover:bg-indigo-50/30 hover:text-indigo-700 dark:border-gray-600 dark:text-gray-300 dark:hover:border-indigo-600 dark:hover:bg-indigo-900/10",
              isRunning && "opacity-50 cursor-not-allowed"
            )}
          >
            <Plus size={16} />
            {textJobs.length === 0
              ? "テキスト入力欄を追加"
              : textJobs.length >= MAX_TEXT_SLOTS
              ? `上限に達しました（最大${MAX_TEXT_SLOTS}件）`
              : `入力欄を追加 (${textJobs.length}/${MAX_TEXT_SLOTS})`}
          </button>
        )}

        {/* 実行ボタン */}
        <div className="flex gap-3">
          <Button
            onClick={() =>
              runAll(visibleJobs.map((j) => j.id))
            }
            disabled={pendingRunnable.length === 0 || isRunning}
            size="lg"
            className="flex-1"
          >
            <Play size={16} />
            {isRunning
              ? "処理中..."
              : pendingRunnable.length > 0
              ? `${pendingRunnable.length}件を処理する`
              : inputMode === "text" && textJobs.length > 0
              ? "テキストを入力してください（10文字以上）"
              : "処理するジョブがありません"}
          </Button>
          {jobs.length > 0 && !isRunning && (
            <Button onClick={resetAll} variant="secondary" size="lg">
              <RotateCcw size={16} />
              全てリセット
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

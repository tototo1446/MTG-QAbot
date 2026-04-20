"use client";

import { useState } from "react";
import MultiFileDropzone from "@/components/knowledge/MultiFileDropzone";
import JobCard from "@/components/knowledge/JobCard";
import MetadataForm from "@/components/knowledge/MetadataForm";
import ProgressTracker from "@/components/knowledge/ProgressTracker";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useKnowledgeUpload } from "@/hooks/useKnowledgeUpload";
import { useKnowledgeJobs } from "@/hooks/useKnowledgeJobs";
import { Database, RotateCcw, FileText, Type, Mic, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KnowledgeInputMode } from "@/types";

const INPUT_MODES: { key: KnowledgeInputMode; label: string; icon: typeof FileText }[] = [
  { key: "file", label: "テキストファイル", icon: FileText },
  { key: "text", label: "テキスト入力", icon: Type },
  { key: "media", label: "音声 / 動画", icon: Mic },
];

const todayJst = () => {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
};

export default function KnowledgePage() {
  const [inputMode, setInputMode] = useState<KnowledgeInputMode>("file");
  const [directText, setDirectText] = useState("");
  const [mtgTitle, setMtgTitle] = useState("");
  const [mtgDate, setMtgDate] = useState("");

  // text モード用（単発）
  const textUpload = useKnowledgeUpload();

  // file / media モード用（並列）
  const {
    jobs,
    isRunning,
    addFiles,
    removeJob,
    updateTitle,
    updateDate,
    runAll,
    clearCompleted,
    resetAll,
  } = useKnowledgeJobs();

  const isTextProcessing =
    textUpload.step === "uploading" || textUpload.step === "processing";

  const pendingJobCount = jobs.filter(
    (j) => j.step === "idle" || j.step === "error"
  ).length;
  const completedJobCount = jobs.filter((j) => j.step === "completed").length;

  const handleAddFiles = (files: File[]) => {
    if (inputMode !== "file" && inputMode !== "media") return;
    addFiles(files, inputMode, mtgTitle, mtgDate);
  };

  const canSubmitText =
    !isTextProcessing && directText.trim().length > 10;

  const handleTextSubmit = async () => {
    const effectiveTitle = mtgTitle.trim() || `テキスト入力_${todayJst()}`;
    const effectiveDate = mtgDate || todayJst();
    await textUpload.upload(
      directText,
      effectiveTitle,
      effectiveDate,
      "text"
    );
  };

  const handleResetText = () => {
    setDirectText("");
    setMtgTitle("");
    setMtgDate("");
    textUpload.reset();
  };

  const handleModeChange = (mode: KnowledgeInputMode) => {
    if (isRunning || isTextProcessing) return;
    setInputMode(mode);
    setDirectText("");
    if (mode === "text") {
      resetAll();
    } else {
      textUpload.reset();
    }
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
              disabled={isRunning || isTextProcessing}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all",
                inputMode === mode.key
                  ? "bg-white text-indigo-700 shadow-sm dark:bg-gray-700 dark:text-indigo-300"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
                (isRunning || isTextProcessing) && "opacity-50 cursor-not-allowed"
              )}
            >
              <mode.icon size={16} />
              <span className="hidden sm:inline">{mode.label}</span>
            </button>
          ))}
        </div>

        {/* 共通メタデータ（全ジョブに適用される既定値） */}
        <Card className="animate-fade-in" style={{ animationDelay: "0.05s" }}>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
            MTG情報
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            未入力の場合は、ファイル名＋本日の日付が自動で使われます。
            {inputMode !== "text" &&
              "（各ジョブ単位でも個別に編集可能）"}
          </p>
          <MetadataForm
            title={mtgTitle}
            date={mtgDate}
            onTitleChange={setMtgTitle}
            onDateChange={setMtgDate}
            disabled={isRunning || isTextProcessing}
          />
        </Card>

        {/* text モード */}
        {inputMode === "text" && (
          <>
            <Card className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                テキスト入力
              </h2>
              <textarea
                value={directText}
                onChange={(e) => setDirectText(e.target.value)}
                disabled={isTextProcessing}
                placeholder={
                  "MTGの議事録やメモをここに貼り付けてください...\n\n例:\n0:00 田中: 今日は企画会議です\n0:15 鈴木: 新しい動画のネタについて話しましょう"
                }
                className="w-full rounded-lg border border-gray-300 bg-white p-4 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 disabled:opacity-50"
                rows={10}
              />
            </Card>

            <div className="flex gap-3">
              <Button
                onClick={handleTextSubmit}
                disabled={!canSubmitText}
                size="lg"
                className="flex-1"
              >
                {isTextProcessing ? "処理中..." : "ナレッジを蓄積する"}
              </Button>
              {(textUpload.step === "completed" ||
                textUpload.step === "error") && (
                <Button
                  onClick={handleResetText}
                  variant="secondary"
                  size="lg"
                >
                  <RotateCcw size={16} />
                  リセット
                </Button>
              )}
            </div>

            <ProgressTracker
              currentStep={textUpload.step}
              error={textUpload.error}
              result={textUpload.result}
              nodeStatus={textUpload.nodeStatus}
              errorAtStep={textUpload.errorAtStep}
              failedNode={textUpload.failedNode}
            />
          </>
        )}

        {/* file / media モード */}
        {(inputMode === "file" || inputMode === "media") && (
          <>
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

            {jobs.length > 0 && (
              <Card
                className="animate-fade-in"
                style={{ animationDelay: "0.15s" }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                    ジョブ ({jobs.length})
                  </h2>
                  {(completedJobCount > 0 || pendingJobCount === 0) &&
                    !isRunning && (
                      <button
                        onClick={clearCompleted}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        完了/失敗をクリア
                      </button>
                    )}
                </div>
                <div className="space-y-3">
                  {jobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      onRemove={removeJob}
                      onTitleChange={updateTitle}
                      onDateChange={updateDate}
                      disabled={isRunning}
                    />
                  ))}
                </div>
              </Card>
            )}

            <div className="flex gap-3">
              <Button
                onClick={runAll}
                disabled={pendingJobCount === 0 || isRunning}
                size="lg"
                className="flex-1"
              >
                <Play size={16} />
                {isRunning
                  ? "処理中..."
                  : pendingJobCount > 0
                  ? `${pendingJobCount}件を処理する`
                  : "処理するジョブがありません"}
              </Button>
              {jobs.length > 0 && !isRunning && (
                <Button onClick={resetAll} variant="secondary" size="lg">
                  <RotateCcw size={16} />
                  全てリセット
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

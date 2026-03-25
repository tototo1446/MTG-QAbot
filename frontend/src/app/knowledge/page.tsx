"use client";

import { useState } from "react";
import FileUpload from "@/components/knowledge/FileUpload";
import MetadataForm from "@/components/knowledge/MetadataForm";
import ProgressTracker from "@/components/knowledge/ProgressTracker";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { useKnowledgeUpload } from "@/hooks/useKnowledgeUpload";
import { Database, RotateCcw, FileText, Type, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KnowledgeInputMode } from "@/types";

const INPUT_MODES: { key: KnowledgeInputMode; label: string; icon: typeof FileText }[] = [
  { key: "file", label: "テキストファイル", icon: FileText },
  { key: "text", label: "テキスト入力", icon: Type },
  { key: "media", label: "音声 / 動画", icon: Mic },
];

export default function KnowledgePage() {
  const [inputMode, setInputMode] = useState<KnowledgeInputMode>("file");
  const [file, setFile] = useState<File | null>(null);
  const [directText, setDirectText] = useState("");
  const [mtgTitle, setMtgTitle] = useState("");
  const [mtgDate, setMtgDate] = useState("");
  const { step, error, result, nodeStatus, errorAtStep, failedNode, upload, reset } = useKnowledgeUpload();

  const isProcessing = step === "uploading" || step === "processing";

  const canSubmit = (() => {
    if (isProcessing || !mtgTitle || !mtgDate) return false;
    if (inputMode === "file") return !!file;
    if (inputMode === "text") return directText.trim().length > 10;
    if (inputMode === "media") return !!file;
    return false;
  })();

  const handleSubmit = async () => {
    if (!mtgTitle || !mtgDate) return;
    if (inputMode === "file" && file) {
      await upload(file, mtgTitle, mtgDate, "file");
    } else if (inputMode === "text" && directText.trim()) {
      await upload(directText, mtgTitle, mtgDate, "text");
    } else if (inputMode === "media" && file) {
      await upload(file, mtgTitle, mtgDate, "media");
    }
  };

  const handleReset = () => {
    setFile(null);
    setDirectText("");
    setMtgTitle("");
    setMtgDate("");
    reset();
  };

  // モード切替時にファイル/テキストをリセット
  const handleModeChange = (mode: KnowledgeInputMode) => {
    setInputMode(mode);
    setFile(null);
    setDirectText("");
  };

  return (
    <div className="p-6 lg:p-10 max-w-2xl mx-auto">
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
          MTG議事録をアップロードして、ナレッジベースに蓄積します
        </p>
      </div>

      <div className="space-y-6">
        {/* 入力モード切替タブ */}
        <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800/50">
          {INPUT_MODES.map((mode) => (
            <button
              key={mode.key}
              onClick={() => handleModeChange(mode.key)}
              disabled={isProcessing}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all",
                inputMode === mode.key
                  ? "bg-white text-indigo-700 shadow-sm dark:bg-gray-700 dark:text-indigo-300"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200",
                isProcessing && "opacity-50 cursor-not-allowed"
              )}
            >
              <mode.icon size={16} />
              <span className="hidden sm:inline">{mode.label}</span>
            </button>
          ))}
        </div>

        {/* 入力エリア */}
        <Card className="animate-fade-in" style={{ animationDelay: "0.05s" }}>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
            {inputMode === "file" && "ファイル選択"}
            {inputMode === "text" && "テキスト入力"}
            {inputMode === "media" && "音声 / 動画ファイル選択"}
          </h2>

          {inputMode === "file" && (
            <FileUpload
              file={file}
              onFileSelect={setFile}
              disabled={isProcessing}
              mode="document"
            />
          )}

          {inputMode === "text" && (
            <textarea
              value={directText}
              onChange={(e) => setDirectText(e.target.value)}
              disabled={isProcessing}
              placeholder={"MTGの議事録やメモをここに貼り付けてください...\n\n例:\n0:00 田中: 今日は企画会議です\n0:15 鈴木: 新しい動画のネタについて話しましょう"}
              className="w-full rounded-lg border border-gray-300 bg-white p-4 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 disabled:opacity-50"
              rows={10}
            />
          )}

          {inputMode === "media" && (
            <>
              <FileUpload
                file={file}
                onFileSelect={setFile}
                disabled={isProcessing}
                mode="media"
              />
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                音声/動画ファイルはサーバー側でAI文字起こし（話者分離付き）を行った後、ナレッジに変換します。処理に数分かかる場合があります。
              </p>
            </>
          )}
        </Card>

        {/* メタデータ入力 */}
        <Card className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
            MTG情報
          </h2>
          <MetadataForm
            title={mtgTitle}
            date={mtgDate}
            onTitleChange={setMtgTitle}
            onDateChange={setMtgDate}
            disabled={isProcessing}
          />
        </Card>

        {/* 実行ボタン */}
        <div className="flex gap-3">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            size="lg"
            className="flex-1"
          >
            {isProcessing ? "処理中..." : "ナレッジを蓄積する"}
          </Button>
          {(step === "completed" || step === "error") && (
            <Button onClick={handleReset} variant="secondary" size="lg">
              <RotateCcw size={16} />
              リセット
            </Button>
          )}
        </div>

        {/* プログレス */}
        <ProgressTracker
          currentStep={step}
          error={error}
          result={result}
          nodeStatus={nodeStatus}
          errorAtStep={errorAtStep}
          failedNode={failedNode}
        />
      </div>
    </div>
  );
}

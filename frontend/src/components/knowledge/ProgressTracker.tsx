"use client";

import { cn } from "@/lib/utils";
import { Check, Loader2, AlertCircle, Upload, Cpu, CheckCircle2, Download } from "lucide-react";
import type { UploadStep } from "@/types";

interface ProgressTrackerProps {
  currentStep: UploadStep;
  error?: string;
  nodeStatus?: string;
  errorAtStep?: "uploading" | "processing";
  failedNode?: string;
  result?: {
    chunkCount?: number;
    qaCount?: number;
    results?: string;
    qaData?: Array<{
      mtg_title: string;
      mtg_date: string;
      topic: string;
      time_range: string;
      question: string;
      answer: string;
      fixed_tags: string;
      free_tags: string;
      speaker: string;
      project: string;
    }>;
  };
}

const steps = [
  { key: "uploading" as const, label: "ファイルアップロード", icon: Upload },
  { key: "processing" as const, label: "ナレッジ変換処理", icon: Cpu },
  { key: "completed" as const, label: "完了", icon: CheckCircle2 },
];

function getStepState(stepKey: string, currentStep: UploadStep, errorAtStep?: "uploading" | "processing") {
  const order = ["uploading", "processing", "completed"];
  const currentIndex = order.indexOf(currentStep);
  const stepIndex = order.indexOf(stepKey);

  if (currentStep === "completed") return "done";
  if (currentStep === "error" && errorAtStep) {
    const errorIndex = order.indexOf(errorAtStep);
    if (stepIndex < errorIndex) return "done";
    if (stepIndex === errorIndex) return "error";
    return "pending";
  }
  if (currentStep === "error") return "error";
  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "active";
  return "pending";
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCsv(qaData: NonNullable<ProgressTrackerProps["result"]>["qaData"]) {
  if (!qaData || qaData.length === 0) return;

  const headers = ["MTGタイトル", "MTG日付", "トピック", "時間帯", "質問", "回答", "固定タグ", "自由タグ", "話者", "プロジェクト"];
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
  const blob = new Blob([bom + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `QA_${qaData[0].mtg_title}_${qaData[0].mtg_date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ProgressTracker({ currentStep, error, nodeStatus, errorAtStep, failedNode, result }: ProgressTrackerProps) {
  if (currentStep === "idle") return null;

  return (
    <div className="animate-fade-in space-y-6">
      {/* ステップインジケーター */}
      <div className="space-y-3">
        {steps.map((step) => {
          const state = getStepState(step.key, currentStep, errorAtStep);
          const Icon = step.icon;

          return (
            <div key={step.key}>
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                    {
                      "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400": state === "done",
                      "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400": state === "active",
                      "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500": state === "pending",
                      "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400": state === "error",
                    }
                  )}
                >
                  {state === "done" ? (
                    <Check size={16} />
                  ) : state === "active" ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : state === "error" ? (
                    <AlertCircle size={16} />
                  ) : (
                    <Icon size={16} />
                  )}
                </div>
                <span
                  className={cn("text-sm font-medium", {
                    "text-emerald-700 dark:text-emerald-300": state === "done",
                    "text-indigo-700 dark:text-indigo-300": state === "active",
                    "text-gray-400 dark:text-gray-500": state === "pending",
                    "text-red-700 dark:text-red-300": state === "error",
                  })}
                >
                  {step.label}
                </span>
              </div>
              {/* 処理中のノード名を表示 */}
              {step.key === "processing" && state === "active" && nodeStatus && (
                <p className="ml-11 mt-1 text-xs text-indigo-500 dark:text-indigo-400">
                  {nodeStatus}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* プログレスバー */}
      <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            currentStep === "error"
              ? "bg-red-500"
              : "bg-gradient-to-r from-indigo-500 to-purple-500"
          )}
          style={{
            width:
              currentStep === "uploading" ? "33%" :
              currentStep === "processing" ? "66%" :
              currentStep === "completed" ? "100%" :
              currentStep === "error" ? (errorAtStep === "uploading" ? "33%" : errorAtStep === "processing" ? "66%" : "100%") : "0%",
          }}
        />
      </div>

      {/* エラー表示 */}
      {currentStep === "error" && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-600 dark:text-red-400" />
            <p className="text-sm font-medium text-red-700 dark:text-red-300">エラーが発生しました</p>
          </div>
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
          {failedNode && (
            <p className="mt-1 text-xs text-red-500 dark:text-red-400/80">
              失敗ノード: {failedNode}
            </p>
          )}
        </div>
      )}

      {/* 結果表示 */}
      {currentStep === "completed" && result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">処理が完了しました</p>
          </div>
          {result.chunkCount !== undefined && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              生成されたチャンク数: <span className="font-semibold">{result.chunkCount}</span>
            </p>
          )}
          {result.qaCount !== undefined && (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              生成されたQAペア数: <span className="font-semibold">{result.qaCount}</span>
            </p>
          )}
          {result.qaData && result.qaData.length > 0 && (
            <button
              onClick={() => downloadCsv(result.qaData)}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
            >
              <Download size={16} />
              CSVダウンロード
            </button>
          )}
        </div>
      )}
    </div>
  );
}

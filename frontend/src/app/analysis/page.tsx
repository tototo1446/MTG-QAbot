"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useAnalysis } from "@/hooks/useAnalysis";
import { BarChart3, Play, Square } from "lucide-react";

export default function AnalysisPage() {
  const { content, isStreaming, error, analyze, cancel } = useAnalysis();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [project, setProject] = useState("");
  const [projects, setProjects] = useState<string[]>([]);

  useEffect(() => {
    // デフォルト期間: 過去30日
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);

    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => {});
  }, []);

  const handleSubmit = () => {
    if (!startDate || !endDate) return;
    analyze(startDate, endDate, project || undefined);
  };

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
          <BarChart3 size={22} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            課題分析
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            蓄積されたナレッジから組織の課題を3軸で分析します
          </p>
        </div>
      </div>

      {/* 分析条件カード */}
      <Card>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
          分析条件
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              開始日
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              終了日
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              プロジェクト（任意）
            </label>
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="">全プロジェクト</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            {isStreaming ? (
              <Button onClick={cancel} variant="secondary" className="w-full">
                <Square size={14} />
                中止
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!startDate || !endDate}
                className="w-full"
              >
                <Play size={14} />
                分析実行
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* エラー表示 */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </Card>
      )}

      {/* 分析結果カード */}
      {(content || isStreaming) && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              分析結果
            </h2>
            {isStreaming && <Spinner size="sm" />}
          </div>
          <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-gray-900 dark:prose-headings:text-gray-100 prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-strong:text-gray-900 dark:prose-strong:text-gray-100">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </Card>
      )}
    </div>
  );
}

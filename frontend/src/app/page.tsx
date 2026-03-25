"use client";

import Link from "next/link";
import Card from "@/components/ui/Card";
import { Database, MessageCircle, BarChart3, ArrowRight, Sparkles } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto">
      {/* ヒーローセクション */}
      <div className="animate-fade-in relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-500 to-purple-600 p-8 lg:p-12 text-white mb-10">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={20} className="text-indigo-200" />
            <span className="text-sm font-medium text-indigo-200">AI-Powered Knowledge Base</span>
          </div>
          <h1 className="text-3xl lg:text-4xl font-bold mb-3">
            MTG Knowledge Hub
          </h1>
          <p className="text-lg text-indigo-100 max-w-2xl">
            MTG音声データからナレッジを蓄積し、AIが質問に回答します。
            議事録をアップロードして、チームの知識を即座に検索可能にしましょう。
          </p>
        </div>
      </div>

      {/* CTAカード */}
      <div className="grid gap-6 md:grid-cols-3">
        <Link href="/knowledge" className="group">
          <Card hover className="h-full animate-fade-in" style={{ animationDelay: "0.1s" }}>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-200">
                <Database size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  ナレッジを蓄積する
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  MTGの議事録をアップロードして、AIが構造化されたナレッジとして蓄積します。
                </p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400 group-hover:gap-2 transition-all">
                  アップロードする
                  <ArrowRight size={16} />
                </span>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/chat" className="group">
          <Card hover className="h-full animate-fade-in" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-colors duration-200">
                <MessageCircle size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  ナレッジに質問する
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  蓄積されたナレッジに対して自然言語で質問し、AIがリアルタイムで回答します。
                </p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-purple-600 dark:text-purple-400 group-hover:gap-2 transition-all">
                  質問する
                  <ArrowRight size={16} />
                </span>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/analysis" className="group">
          <Card hover className="h-full animate-fade-in" style={{ animationDelay: "0.3s" }}>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 group-hover:bg-amber-600 group-hover:text-white transition-colors duration-200">
                <BarChart3 size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  課題を分析する
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                  蓄積されたナレッジから組織の課題を3軸（システム/研修/採用）で分析します。
                </p>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-amber-600 dark:text-amber-400 group-hover:gap-2 transition-all">
                  分析する
                  <ArrowRight size={16} />
                </span>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}

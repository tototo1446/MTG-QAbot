"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BookOpen, Home, MessageCircle, Database, BarChart3, X, FolderOpen } from "lucide-react";

const navItems = [
  { href: "/", label: "ダッシュボード", icon: Home },
  { href: "/knowledge", label: "ナレッジ蓄積", icon: Database },
  { href: "/chat", label: "Q&Aチャット", icon: MessageCircle },
  { href: "/analysis", label: "課題分析", icon: BarChart3 },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [projects, setProjects] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then((data) => setProjects(data.projects || []))
      .catch(() => {});
  }, []);

  return (
    <>
      {/* モバイルオーバーレイ */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 transition-transform duration-300 lg:translate-x-0 lg:static lg:z-auto",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* ロゴ */}
        <div className="flex h-16 items-center justify-between px-6 border-b border-gray-200 dark:border-gray-700">
          <Link href="/" className="flex items-center gap-2.5" onClick={onClose}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <BookOpen size={18} />
            </div>
            <span className="text-lg font-semibold text-gray-900 dark:text-white">
              MTG Knowledge
            </span>
          </Link>
          <button
            onClick={onClose}
            className="lg:hidden text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <X size={20} />
          </button>
        </div>

        {/* ナビゲーション */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                  isActive
                    ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                )}
              >
                <item.icon size={20} />
                {item.label}
              </Link>
            );
          })}

          {/* プロジェクト一覧 */}
          {projects.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h3 className="flex items-center gap-2 px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                <FolderOpen size={14} />
                プロジェクト
              </h3>
              {projects.map((p) => (
                <Link
                  key={p}
                  href={`/chat?project=${encodeURIComponent(p)}`}
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors duration-150"
                >
                  <span className="h-2 w-2 rounded-full bg-indigo-400" />
                  {p}
                </Link>
              ))}
            </div>
          )}
        </nav>

        {/* フッター */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            MTG Knowledge SaaS v1.0
          </p>
        </div>
      </aside>
    </>
  );
}

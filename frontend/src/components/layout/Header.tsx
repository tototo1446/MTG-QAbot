"use client";

import { useTheme } from "next-themes";
import { Menu, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

interface HeaderProps {
  onMenuClick: () => void;
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white/80 backdrop-blur-sm px-4 lg:px-6 dark:border-gray-700 dark:bg-gray-900/80">
      <button
        onClick={onMenuClick}
        className="lg:hidden rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      >
        <Menu size={20} />
      </button>

      <div className="flex-1" />

      {/* テーマ切り替え */}
      {mounted && (
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
          aria-label="テーマ切り替え"
        >
          {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      )}
    </header>
  );
}

import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "error";
}

export default function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        {
          "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300": variant === "default",
          "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300": variant === "success",
          "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300": variant === "warning",
          "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300": variant === "error",
        },
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

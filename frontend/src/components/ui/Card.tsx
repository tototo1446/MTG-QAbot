import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export default function Card({ className, hover = false, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800",
        hover && "transition-all duration-200 hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

"use client";

import { useCallback, useRef, useState } from "react";
import {
  runKnowledgeUpload,
  type UploadResult,
} from "@/lib/knowledge-uploader";
import type { UploadStep } from "@/types";

export type FileJobMode = "file" | "media";

interface JobCommon {
  id: string;
  title: string;
  date: string;
  step: UploadStep;
  nodeStatus: string;
  error?: string;
  errorAtStep?: "uploading" | "processing";
  failedNode?: string;
  result?: UploadResult;
}

export interface FileJob extends JobCommon {
  kind: "file";
  mode: FileJobMode;
  file: File;
}

export interface TextJob extends JobCommon {
  kind: "text";
  text: string;
}

export type KnowledgeJob = FileJob | TextJob;

const MAX_CONCURRENCY = 10;
export const MAX_TEXT_SLOTS = 10;

const stripExtension = (name: string) => name.replace(/\.[^./\\]+$/, "");

const todayJst = () => {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
};

// HHMMSSmmm + ランダム英数 — 並列実行でのキー衝突を避けるため
// ミリ秒精度 + 短いランダムサフィックスで一意化する
const uniqueTimeSuffix = () => {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const hhmmssMs = jst.toISOString().slice(11, 23).replace(/[:.]/g, "");
  const rand = Math.random().toString(36).slice(2, 6);
  return `${hhmmssMs}${rand}`;
};

const createId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** セッション内のキー衝突を避けるため、重複があれば "(2)" 等のサフィックスを付与 */
const uniquifyTitle = (base: string, date: string, taken: Set<string>) => {
  const key = (t: string) => `${t}__${date}`;
  if (!taken.has(key(base))) {
    taken.add(key(base));
    return base;
  }
  let i = 2;
  while (taken.has(key(`${base} (${i})`))) i++;
  const finalTitle = `${base} (${i})`;
  taken.add(key(finalTitle));
  return finalTitle;
};

export function useKnowledgeJobs() {
  const [jobs, setJobs] = useState<KnowledgeJob[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const patchJob = useCallback(
    (id: string, patch: Partial<JobCommon>) => {
      setJobs((prev) =>
        prev.map((job) =>
          job.id === id ? ({ ...job, ...patch } as KnowledgeJob) : job
        )
      );
    },
    []
  );

  const addFiles = useCallback(
    (
      files: File[],
      mode: FileJobMode,
      sharedTitle = "",
      sharedDate = ""
    ) => {
      const effectiveDate = sharedDate || todayJst();
      const sharedBase = sharedTitle.trim();

      setJobs((prev) => {
        // 既存ジョブのtitle+dateを taken に登録（セッション内の重複回避）
        const taken = new Set<string>(
          prev.map((j) => `${j.title}__${j.date}`)
        );

        const newJobs: FileJob[] = files.map((file) => {
          const fileBase = stripExtension(file.name);
          // 共通titleが入っている場合はそれをベースにしつつ、
          // 複数ファイルでキー衝突しないようファイル名を付与してユニーク化
          const baseTitle = sharedBase
            ? files.length > 1
              ? `${sharedBase} - ${fileBase}`
              : sharedBase
            : fileBase;
          const title = uniquifyTitle(baseTitle, effectiveDate, taken);
          return {
            id: createId(),
            kind: "file",
            file,
            mode,
            title,
            date: effectiveDate,
            step: "idle",
            nodeStatus: "",
          };
        });
        return [...prev, ...newJobs];
      });
    },
    []
  );

  const addTextJob = useCallback(
    (sharedTitle = "", sharedDate = "") => {
      setJobs((prev) => {
        const textJobCount = prev.filter((j) => j.kind === "text").length;
        if (textJobCount >= MAX_TEXT_SLOTS) return prev;

        const effectiveDate = sharedDate || todayJst();
        const sharedBase = sharedTitle.trim();
        const taken = new Set<string>(
          prev.map((j) => `${j.title}__${j.date}`)
        );
        const baseTitle =
          sharedBase ||
          `テキスト入力_${effectiveDate}_${uniqueTimeSuffix()}_${textJobCount + 1}`;
        const title = uniquifyTitle(baseTitle, effectiveDate, taken);

        const newJob: TextJob = {
          id: createId(),
          kind: "text",
          text: "",
          title,
          date: effectiveDate,
          step: "idle",
          nodeStatus: "",
        };
        return [...prev, newJob];
      });
    },
    []
  );

  const updateText = useCallback(
    (id: string, text: string) => {
      setJobs((prev) =>
        prev.map((job) =>
          job.id === id && job.kind === "text" ? { ...job, text } : job
        )
      );
    },
    []
  );

  const removeJob = useCallback((id: string) => {
    setJobs((prev) =>
      prev.filter((job) => {
        if (job.id !== id) return true;
        return job.step === "uploading" || job.step === "processing";
      })
    );
  }, []);

  const clearCompleted = useCallback((jobIds?: string[]) => {
    const allowedSet = jobIds ? new Set(jobIds) : null;
    setJobs((prev) =>
      prev.filter((job) => {
        const isDoneOrError =
          job.step === "completed" || job.step === "error";
        if (!isDoneOrError) return true;
        // 対象IDが指定されている場合は、その範囲内の完了/失敗ジョブのみ削除
        if (allowedSet && !allowedSet.has(job.id)) return true;
        return false;
      })
    );
  }, []);

  const resetAll = useCallback(() => {
    setJobs([]);
    setIsRunning(false);
  }, []);

  const updateTitle = useCallback(
    (id: string, title: string) => patchJob(id, { title }),
    [patchJob]
  );
  const updateDate = useCallback(
    (id: string, date: string) => patchJob(id, { date }),
    [patchJob]
  );

  const runAll = useCallback(async (jobIds?: string[]) => {
    const allowedSet = jobIds ? new Set(jobIds) : null;
    const pending = jobsRef.current.filter(
      (j) =>
        (j.step === "idle" || j.step === "error") &&
        (!allowedSet || allowedSet.has(j.id))
    );
    const runnable = pending.filter((j) => {
      if (j.kind === "file") return true;
      return j.text.trim().length > 10;
    });
    if (runnable.length === 0 || isRunning) return;

    setIsRunning(true);

    const runnableIds = new Set(runnable.map((j) => j.id));
    setJobs((prev) =>
      prev.map((job) =>
        runnableIds.has(job.id)
          ? {
              ...job,
              step: "uploading",
              nodeStatus: "",
              error: undefined,
              errorAtStep: undefined,
              failedNode: undefined,
              result: undefined,
            }
          : job
      )
    );

    const queue = [...runnable];
    const runOne = async (job: KnowledgeJob) => {
      const input = job.kind === "file" ? job.file : job.text;
      const mode = job.kind === "file" ? job.mode : "text";
      await runKnowledgeUpload(
        {
          input,
          mode,
          mtgTitle: job.title,
          mtgDate: job.date || todayJst(),
        },
        {
          onStep: (step) => patchJob(job.id, { step }),
          onNodeStatus: (nodeStatus) => patchJob(job.id, { nodeStatus }),
          onResult: (result) => patchJob(job.id, { result }),
          onError: (error, errorAtStep, failedNode) =>
            patchJob(job.id, { error, errorAtStep, failedNode }),
        }
      );
    };

    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(MAX_CONCURRENCY, queue.length) },
      async () => {
        while (cursor < queue.length) {
          const idx = cursor++;
          await runOne(queue[idx]);
        }
      }
    );
    await Promise.all(workers);

    setIsRunning(false);
  }, [isRunning, patchJob]);

  return {
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
  };
}

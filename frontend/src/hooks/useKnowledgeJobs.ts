"use client";

import { useCallback, useRef, useState } from "react";
import {
  runKnowledgeUpload,
  type UploadResult,
} from "@/lib/knowledge-uploader";
import type { UploadStep } from "@/types";

export type JobMode = "file" | "media";

export interface KnowledgeJob {
  id: string;
  file: File;
  mode: JobMode;
  title: string;
  date: string;
  step: UploadStep;
  nodeStatus: string;
  error?: string;
  errorAtStep?: "uploading" | "processing";
  failedNode?: string;
  result?: UploadResult;
}

const MAX_CONCURRENCY = 10;

const stripExtension = (name: string) => name.replace(/\.[^./\\]+$/, "");

const todayJst = () => {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
};

const createId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function useKnowledgeJobs() {
  const [jobs, setJobs] = useState<KnowledgeJob[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const patchJob = useCallback(
    (id: string, patch: Partial<KnowledgeJob>) => {
      setJobs((prev) =>
        prev.map((job) => (job.id === id ? { ...job, ...patch } : job))
      );
    },
    []
  );

  const addFiles = useCallback(
    (files: File[], mode: JobMode, sharedTitle = "", sharedDate = "") => {
      const fallbackDate = sharedDate || todayJst();
      const newJobs: KnowledgeJob[] = files.map((file) => ({
        id: createId(),
        file,
        mode,
        title: sharedTitle || stripExtension(file.name),
        date: fallbackDate,
        step: "idle",
        nodeStatus: "",
      }));
      setJobs((prev) => [...prev, ...newJobs]);
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

  const clearCompleted = useCallback(() => {
    setJobs((prev) =>
      prev.filter((job) => job.step !== "completed" && job.step !== "error")
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

  const runAll = useCallback(async () => {
    const pending = jobsRef.current.filter(
      (j) => j.step === "idle" || j.step === "error"
    );
    if (pending.length === 0 || isRunning) return;

    setIsRunning(true);

    setJobs((prev) =>
      prev.map((job) =>
        job.step === "idle" || job.step === "error"
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

    const queue = [...pending];
    const runOne = async (job: KnowledgeJob) => {
      await runKnowledgeUpload(
        {
          input: job.file,
          mode: job.mode,
          mtgTitle: job.title || stripExtension(job.file.name),
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
    removeJob,
    updateTitle,
    updateDate,
    runAll,
    clearCompleted,
    resetAll,
  };
}

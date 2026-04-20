"use client";

import { useState, useCallback } from "react";
import type { UploadStep, KnowledgeInputMode } from "@/types";
import {
  runKnowledgeUpload,
  type UploadResult,
} from "@/lib/knowledge-uploader";

export function useKnowledgeUpload() {
  const [step, setStep] = useState<UploadStep>("idle");
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<UploadResult>();
  const [nodeStatus, setNodeStatus] = useState<string>("");
  const [errorAtStep, setErrorAtStep] = useState<"uploading" | "processing">();
  const [failedNode, setFailedNode] = useState<string>();

  const upload = useCallback(
    async (
      input: File | string,
      mtgTitle: string,
      mtgDate: string,
      mode: KnowledgeInputMode = "file"
    ) => {
      setStep("uploading");
      setError(undefined);
      setResult(undefined);
      setNodeStatus("");
      setErrorAtStep(undefined);
      setFailedNode(undefined);

      await runKnowledgeUpload(
        { input, mode, mtgTitle, mtgDate },
        {
          onStep: setStep,
          onNodeStatus: setNodeStatus,
          onResult: setResult,
          onError: (message, atStep, failedNodeTitle) => {
            setError(message);
            setErrorAtStep(atStep);
            if (failedNodeTitle) setFailedNode(failedNodeTitle);
          },
        }
      );
    },
    []
  );

  const reset = useCallback(() => {
    setStep("idle");
    setError(undefined);
    setResult(undefined);
    setNodeStatus("");
    setErrorAtStep(undefined);
    setFailedNode(undefined);
  }, []);

  return {
    step,
    error,
    result,
    nodeStatus,
    errorAtStep,
    failedNode,
    upload,
    reset,
  };
}

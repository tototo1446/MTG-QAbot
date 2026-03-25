// ナレッジ蓄積関連
export interface KnowledgeUploadResponse {
  id: string;
  name: string;
  size: number;
  created_at: number;
}

export interface KnowledgeWorkflowInput {
  transcript_file: {
    transfer_method: "local_file";
    upload_file_id: string;
    type: "document";
  };
  mtg_title: string;
  mtg_date: string;
}

export interface KnowledgeWorkflowResponse {
  workflow_run_id: string;
  task_id: string;
  data: {
    id: string;
    workflow_id: string;
    status: "succeeded" | "failed" | "running";
    outputs: {
      chunk_count?: number;
      results?: string;
    };
    error?: string;
    created_at: number;
    finished_at: number;
  };
}

// Q&Aチャット関連
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  searchCount?: number;
  timestamp: Date;
}

export interface ChatWorkflowInput {
  user_question: string;
}

// SSEイベント
export interface DifySSEEvent {
  event: "workflow_started" | "node_started" | "node_finished" | "workflow_finished" | "text_chunk" | "error";
  workflow_run_id?: string;
  task_id?: string;
  data?: Record<string, unknown>;
}

// アップロードステップ
export type UploadStep = "idle" | "uploading" | "processing" | "completed" | "error";

export interface UploadProgress {
  step: UploadStep;
  message: string;
}

// ナレッジ入力モード
export type KnowledgeInputMode = "file" | "text" | "media";

// 話者セグメント（Whisper diarized transcript 等の出力単位）
export interface SpeakerSegment {
  speaker: string;
  start: number;
  end: number;
  text: string;
}

// 正規化されたトランスクリプト
export interface NormalizedTranscript {
  /** "HH:MM 話者名: テキスト" 形式の正規化済みテキスト */
  normalizedText: string;
  /** 話者セグメント配列 */
  segments: SpeakerSegment[];
  /** 検出された話者名リスト */
  speakers: string[];
  /** 入力ソース種別 */
  sourceType: KnowledgeInputMode;
}

// タグ体系（taxonomy）
export interface TagTaxonomy {
  id: string;
  name: string;
  description: string;
  fixedTags: string[];
  aliases?: Record<string, string[]>;
  projects?: string[];
}

// 課題分析関連
export interface AnalysisRequest {
  startDate: string;
  endDate: string;
  project?: string;
}

export interface AnalysisResult {
  content: string;
  isStreaming: boolean;
}

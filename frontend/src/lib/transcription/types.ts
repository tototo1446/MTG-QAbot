import type { WhisperSegment } from "@/lib/transcript-normalizer";

/**
 * 文字起こしプロバイダーインターフェース
 * 将来WhisperX/pyannoteに差し替え可能
 */
export interface TranscriptionProvider {
  /** プロバイダー名 */
  name: string;
  /** 音声ファイルを文字起こし+話者分離して返す */
  transcribe(audioBuffer: Buffer, filename: string): Promise<TranscriptionResult>;
}

export interface TranscriptionResult {
  segments: WhisperSegment[];
  language?: string;
  duration?: number;
}

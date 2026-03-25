import type { TranscriptionProvider, TranscriptionResult } from "./types";
import type { WhisperSegment } from "@/lib/transcript-normalizer";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

/**
 * OpenAI Whisper APIを使用した文字起こしプロバイダー
 * timestamp_granularities=segment で話者タイムスタンプ取得
 */
export class OpenAITranscriptionProvider implements TranscriptionProvider {
  name = "openai-whisper";

  async transcribe(
    audioBuffer: Buffer,
    filename: string
  ): Promise<TranscriptionResult> {
    // 25MB以下ならそのまま、超えていたらチャンク分割
    if (audioBuffer.length <= MAX_FILE_SIZE) {
      return this.transcribeChunk(audioBuffer, filename, 0);
    }

    return this.transcribeInChunks(audioBuffer, filename);
  }

  private async transcribeChunk(
    buffer: Buffer,
    filename: string,
    timeOffset: number
  ): Promise<TranscriptionResult> {
    const blob = new Blob([new Uint8Array(buffer)], { type: "audio/wav" });
    const formData = new FormData();
    formData.append("file", blob, filename);
    formData.append("model", "whisper-1");
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");
    formData.append("language", "ja");

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`OpenAI Whisper APIエラー: ${error}`);
    }

    const data = await res.json();
    const rawSegments = data.segments || [];

    const segments: WhisperSegment[] = rawSegments.map(
      (seg: { start: number; end: number; text: string; speaker?: string }) => ({
        start: seg.start + timeOffset,
        end: seg.end + timeOffset,
        text: seg.text,
        speaker: seg.speaker,
      })
    );

    return {
      segments,
      language: data.language,
      duration: data.duration,
    };
  }

  /**
   * 25MB超のファイルをチャンク分割して処理
   * 各チャンクの結果を時刻オフセット付きで結合
   */
  private async transcribeInChunks(
    audioBuffer: Buffer,
    filename: string
  ): Promise<TranscriptionResult> {
    const chunkSize = MAX_FILE_SIZE - 1024 * 1024; // 24MB（余裕を持たせる）
    const chunks: { buffer: Buffer; offset: number }[] = [];

    // バイト単位の粗分割（正確な無音分割はffmpegで行うのが理想だが、
    // Phase 1ではシンプルなバイト分割で対応）
    let offset = 0;
    for (let i = 0; i < audioBuffer.length; i += chunkSize) {
      chunks.push({
        buffer: audioBuffer.subarray(i, Math.min(i + chunkSize, audioBuffer.length)) as Buffer,
        offset,
      });
      // 概算: WAV 16kHz mono 16bit = 32000 bytes/sec
      offset += chunkSize / 32000;
    }

    const allSegments: WhisperSegment[] = [];
    let totalDuration = 0;
    let language: string | undefined;

    for (const chunk of chunks) {
      const result = await this.transcribeChunk(
        chunk.buffer,
        filename,
        chunk.offset
      );
      allSegments.push(...result.segments);
      if (result.duration) totalDuration += result.duration;
      if (result.language) language = result.language;
    }

    return { segments: allSegments, language, duration: totalDuration };
  }
}

import type {
  KnowledgeInputMode,
  NormalizedTranscript,
  SpeakerSegment,
} from "@/types";

/**
 * テキストファイル（Loom/Zoom形式）を正規化
 * 入力形式: "HH:MM 話者名: テキスト" or "H:MM:SS 話者名: テキスト"
 */
export function normalizeTextFile(content: string): NormalizedTranscript {
  const lines = content.trim().split("\n");
  const segments: SpeakerSegment[] = [];
  const speakersSet = new Set<string>();
  const parsedLines: string[] = [];

  const timestampRegex = /^(\d{1,2}:\d{2}(?::\d{2})?)\s+([^:]+):\s*(.+)$/;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(timestampRegex);
    if (match) {
      const timestamp = match[1];
      const speaker = match[2].trim();
      const text = match[3].trim();

      if (text.length < 2) continue;

      speakersSet.add(speaker);
      parsedLines.push(`${timestamp} ${speaker}: ${text}`);

      // タイムスタンプを秒に変換
      const parts = timestamp.split(":").map(Number);
      const seconds =
        parts.length === 3
          ? parts[0] * 3600 + parts[1] * 60 + parts[2]
          : parts[0] * 60 + parts[1];

      segments.push({ speaker, start: seconds, end: seconds, text });
    }
  }

  return {
    normalizedText: parsedLines.join("\n"),
    segments,
    speakers: [...speakersSet].sort(),
    sourceType: "file",
  };
}

/**
 * テキスト直接入力を正規化
 * タイムスタンプ付きの場合はパース、なければ全体を1セグメントとして扱う
 */
export function normalizeDirectText(text: string): NormalizedTranscript {
  const trimmed = text.trim();

  // タイムスタンプ付きフォーマットかチェック
  const hasTimestamps = /^\d{1,2}:\d{2}/.test(trimmed);
  if (hasTimestamps) {
    return { ...normalizeTextFile(trimmed), sourceType: "text" };
  }

  // プレーンテキストの場合：1つのセグメントとして扱う
  return {
    normalizedText: trimmed,
    segments: [{ speaker: "不明", start: 0, end: 0, text: trimmed }],
    speakers: ["不明"],
    sourceType: "text",
  };
}

/**
 * OpenAI Whisper diarized transcript（verbose_json）からの正規化
 * segments配列内の各segmentに speaker フィールドがある想定
 */
export function normalizeWhisperDiarized(
  whisperSegments: WhisperSegment[]
): NormalizedTranscript {
  const speakersSet = new Set<string>();
  const segments: SpeakerSegment[] = [];
  const lines: string[] = [];

  // SPEAKER_00 → 話者A のマッピング
  const speakerMap = new Map<string, string>();
  let speakerIndex = 0;
  const SPEAKER_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  for (const seg of whisperSegments) {
    const rawSpeaker = seg.speaker || "SPEAKER_00";
    if (!speakerMap.has(rawSpeaker)) {
      const label =
        speakerIndex < SPEAKER_LABELS.length
          ? `話者${SPEAKER_LABELS[speakerIndex]}`
          : `話者${speakerIndex + 1}`;
      speakerMap.set(rawSpeaker, label);
      speakerIndex++;
    }

    const speaker = speakerMap.get(rawSpeaker)!;
    const text = seg.text.trim();
    if (!text) continue;

    speakersSet.add(speaker);
    segments.push({
      speaker,
      start: seg.start,
      end: seg.end,
      text,
    });

    const timestamp = formatTimestamp(seg.start);
    lines.push(`${timestamp} ${speaker}: ${text}`);
  }

  return {
    normalizedText: lines.join("\n"),
    segments,
    speakers: [...speakersSet].sort(),
    sourceType: "media",
  };
}

/** Whisper APIセグメントの型 */
export interface WhisperSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

/**
 * 秒数をHH:MM形式に変換
 */
function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * NormalizedTranscriptをDifyに渡すプレーンテキスト(.txt相当)に変換
 */
export function toPlainTranscript(normalized: NormalizedTranscript): string {
  return normalized.normalizedText;
}

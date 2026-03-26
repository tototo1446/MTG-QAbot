import type { TranscriptionProvider, TranscriptionResult } from "./types";
import type { WhisperSegment } from "@/lib/transcript-normalizer";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
const MAX_INLINE_SIZE = 15 * 1024 * 1024; // 15MB（inline_data上限の余裕）

/**
 * Google Gemini APIを使用した文字起こしプロバイダー
 * 音声をマルチモーダル入力として送信し、構造化JSONで文字起こし結果を取得
 */
export class GeminiTranscriptionProvider implements TranscriptionProvider {
  name = "gemini-flash-lite";

  async transcribe(
    audioBuffer: Buffer,
    filename: string
  ): Promise<TranscriptionResult> {
    if (!GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY が設定されていません。.env.local に追加してください"
      );
    }

    const mimeType = getMimeType(filename);

    // 15MB超はFile API経由、それ以下はinline_data
    const audioPart =
      audioBuffer.length > MAX_INLINE_SIZE
        ? await this.uploadAndGetFilePart(audioBuffer, mimeType)
        : {
            inline_data: {
              mime_type: mimeType,
              data: audioBuffer.toString("base64"),
            },
          };

    return this.generateTranscription(audioPart);
  }

  /**
   * Gemini File APIにアップロード済みファイルのURIから文字起こし
   * チャンクアップロード済みの大容量ファイル用
   */
  async transcribeFromUri(
    fileUri: string,
    mimeType: string
  ): Promise<TranscriptionResult> {
    if (!GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY が設定されていません。.env.local に追加してください"
      );
    }

    return this.generateTranscription({
      file_data: {
        mime_type: mimeType,
        file_uri: fileUri,
      },
    });
  }

  /**
   * Gemini APIにマルチモーダルリクエストを送信して文字起こし結果を取得
   */
  private async generateTranscription(
    audioPart: Record<string, unknown>
  ): Promise<TranscriptionResult> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                audioPart,
                {
                  text: TRANSCRIPTION_PROMPT,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Gemini APIエラー: ${error}`);
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

    console.log("[Gemini] レスポンス長:", content?.length, "文字");
    console.log("[Gemini] レスポンス先頭500文字:", content?.slice(0, 500));

    if (!content) {
      const finishReason = data.candidates?.[0]?.finishReason;
      throw new Error(
        `Gemini APIから文字起こし結果を取得できませんでした (finishReason: ${finishReason})`
      );
    }

    const parsed = parseResponse(content);

    const segments: WhisperSegment[] = (parsed.segments || []).map(
      (seg: { start: number; end: number; text: string; speaker?: string }) => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
        speaker: seg.speaker,
      })
    );

    return {
      segments,
      language: parsed.language,
      duration: parsed.duration,
    };
  }

  /**
   * Gemini File APIにアップロードし、fileData partを返す
   * 15MB超の音声ファイル用
   */
  private async uploadAndGetFilePart(
    buffer: Buffer,
    mimeType: string
  ): Promise<Record<string, unknown>> {
    // Step 1: resumable upload開始
    const startRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "X-Goog-Upload-Protocol": "resumable",
          "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": String(buffer.length),
          "X-Goog-Upload-Header-Content-Type": mimeType,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file: { displayName: "audio-upload" } }),
      }
    );

    const uploadUrl = startRes.headers.get("X-Goog-Upload-URL");
    if (!uploadUrl) {
      throw new Error("Gemini File APIのアップロードURL取得に失敗しました");
    }

    // Step 2: データアップロード
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "X-Goog-Upload-Command": "upload, finalize",
        "X-Goog-Upload-Offset": "0",
        "Content-Type": mimeType,
      },
      body: new Uint8Array(buffer),
    });

    if (!uploadRes.ok) {
      const error = await uploadRes.text();
      throw new Error(`Gemini File APIアップロードエラー: ${error}`);
    }

    const fileInfo = await uploadRes.json();
    const fileUri = fileInfo.file?.uri;
    const fileName = fileInfo.file?.name;

    if (!fileUri) {
      throw new Error("Gemini File APIからファイルURIを取得できませんでした");
    }

    // ファイルが ACTIVE になるまで待機
    if (fileName) {
      await this.waitForFileActive(fileName);
    }

    return {
      file_data: {
        mime_type: mimeType,
        file_uri: fileUri,
      },
    };
  }

  /**
   * Gemini File APIのファイルが ACTIVE 状態になるまでポーリング
   * アップロード直後は PROCESSING 状態のため、使用前に待機が必要
   */
  private async waitForFileActive(fileName: string): Promise<void> {
    const maxWaitMs = 120_000; // 最大2分
    const pollIntervalMs = 2_000; // 2秒間隔
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`
      );

      if (!res.ok) {
        const error = await res.text();
        throw new Error(`ファイルステータス確認失敗: ${error}`);
      }

      const data = await res.json();
      const state = data.state;

      console.log(`[Gemini] File ${fileName} state: ${state}`);

      if (state === "ACTIVE") return;
      if (state === "FAILED") {
        throw new Error(
          "Gemini File APIのファイル処理に失敗しました"
        );
      }

      // PROCESSING — 待機してリトライ
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(
      "ファイルのアクティベーション待ちがタイムアウトしました（2分）"
    );
  }
}

const TRANSCRIPTION_PROMPT = `この音声ファイルを文字起こししてください。以下のJSON形式で出力してください。話者が複数いる場合は話者を区別してください。

出力形式（JSONのみ、他のテキストは不要）:
{
  "segments": [
    {"start": 0.0, "end": 5.2, "text": "発言内容", "speaker": "SPEAKER_00"},
    {"start": 5.5, "end": 10.1, "text": "発言内容", "speaker": "SPEAKER_01"}
  ],
  "language": "ja",
  "duration": 120.5
}

注意:
- startとendは秒単位の数値
- speakerは話者ごとにSPEAKER_00, SPEAKER_01, ...と区別
- 話者が1人の場合もSPEAKER_00を指定
- languageは検出した言語コード
- durationは音声全体の長さ（秒）
- テキストは原文のまま（句読点を適切に付与）`;

type ParsedTranscription = {
  segments: Array<{ start: number; end: number; text: string; speaker?: string }>;
  language?: string;
  duration?: number;
};

/**
 * Geminiレスポンスをパース（複数のフォーマットに対応）
 */
function parseResponse(content: string): ParsedTranscription {
  let jsonStr = content.trim();

  // ```json ... ``` で囲まれている場合を除去
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // 1. そのままパース
  try {
    return JSON.parse(jsonStr);
  } catch (e1) {
    console.log("[Gemini] 直接パース失敗、修復を試みます:", (e1 as Error).message);
  }

  // 2. 末尾カンマ除去して再試行
  try {
    const cleaned = jsonStr.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(cleaned);
  } catch {
    console.log("[Gemini] カンマ修復後もパース失敗");
  }

  // 3. JSONオブジェクト部分だけ抽出して再試行
  try {
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) {
      const cleaned = objMatch[0].replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(cleaned);
    }
  } catch {
    console.log("[Gemini] オブジェクト抽出後もパース失敗");
  }

  // 4. 最終手段: segmentsだけ正規表現で抽出
  console.log("[Gemini] 正規表現フォールバックで segments を抽出します");
  const segments: ParsedTranscription["segments"] = [];
  const segRegex = /"start"\s*:\s*([\d.]+)\s*,\s*"end"\s*:\s*([\d.]+)\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"speaker"\s*:\s*"([^"]*)"/g;
  let m;
  while ((m = segRegex.exec(jsonStr)) !== null) {
    segments.push({
      start: parseFloat(m[1]),
      end: parseFloat(m[2]),
      text: m[3].replace(/\\"/g, '"').replace(/\\n/g, "\n"),
      speaker: m[4],
    });
  }

  if (segments.length === 0) {
    console.error("[Gemini] パース完全失敗。レスポンス:", jsonStr.slice(0, 2000));
    throw new Error(
      `Geminiレスポンスのパースに失敗しました。レスポンス先頭: ${jsonStr.slice(0, 200)}`
    );
  }

  console.log(`[Gemini] 正規表現で ${segments.length} セグメント抽出`);
  return { segments, language: "ja" };
}

function getMimeType(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".webm": "audio/webm",
    ".ogg": "audio/ogg",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
  };
  return mimeTypes[ext] || "audio/wav";
}

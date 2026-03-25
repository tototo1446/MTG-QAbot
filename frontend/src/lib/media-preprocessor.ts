import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFile);

const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".wav", ".webm", ".ogg"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov", ".avi", ".mkv"];

export function isAudioFile(filename: string): boolean {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  return AUDIO_EXTENSIONS.includes(ext);
}

export function isVideoFile(filename: string): boolean {
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();
  return VIDEO_EXTENSIONS.includes(ext);
}

export function isMediaFile(filename: string): boolean {
  return isAudioFile(filename) || isVideoFile(filename);
}

/**
 * メディアファイルからWAV音声を抽出（mono 16kHz）
 * OpenAI Whisper APIに直接投げられる形式に変換
 */
export async function extractAudio(inputBuffer: Buffer, originalFilename: string): Promise<Buffer> {
  const id = randomUUID();
  const inputPath = join(tmpdir(), `${id}_input${getExtension(originalFilename)}`);
  const outputPath = join(tmpdir(), `${id}_output.wav`);

  try {
    await writeFile(inputPath, inputBuffer);

    await execFileAsync("ffmpeg", [
      "-i", inputPath,
      "-vn",                // 映像ストリーム除去
      "-acodec", "pcm_s16le",  // 16bit PCM
      "-ar", "16000",       // 16kHz
      "-ac", "1",           // モノラル
      "-y",                 // 上書き許可
      outputPath,
    ], { timeout: 120000 });

    const audioBuffer = await readFile(outputPath);
    return audioBuffer;
  } finally {
    // 一時ファイルクリーンアップ
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.substring(idx).toLowerCase() : "";
}

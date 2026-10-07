"use client";

import audioFiles from "./voice-assets.json";
import { isResultVoiceText } from "./result-voice-request";

const files: Record<string, string> = audioFiles;
let context: AudioContext | undefined;
let source: AudioBufferSourceNode | undefined;
let generation = 0;
let queue: Promise<void> = Promise.resolve();
let unlocking: Promise<void> | undefined;
const buffers = new Map<string, Promise<AudioBuffer>>();

export function isTtsSupported(): boolean {
  return typeof window !== "undefined" && typeof window.AudioContext !== "undefined";
}

function audioContext() {
  if (!isTtsSupported()) throw new Error("이 브라우저에서 음성을 재생할 수 없어요.");
  return context ??= new AudioContext();
}

/** Call directly inside a click/tap so autoplay permissions are retained. */
export function warmUpVoices(): void {
  try {
    const ctx = audioContext();
    unlocking = ctx.resume();
    void unlocking.catch(() => {});
    const silence = ctx.createBufferSource();
    silence.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    silence.connect(ctx.destination);
    silence.start();
  } catch { /* The visible start button provides a retry. */ }
}

function partsFor(text: string): string[] | null {
  if (files[text]) return [text];
  // Compose the sample's changing clock locally. No names or times leave the browser.
  const match = text.match(/^(.+?께서) (오전|오후) (\d{1,2})시 (\d{1,2})분에(?:,)? (.+)$/);
  if (!match) return null;
  const [,name,period,hour,minute,body] = match;
  const ending = body.replace(/^“(.*)”라고 응답했어요\.$/, "$1 라고 응답했어요.");
  const parts = [name, period, `${hour}시`, `${minute}분에`, ending];
  return parts.every(part => files[part]) ? parts : null;
}

function loadAudio(text: string): Promise<AudioBuffer> {
  const key = text.trim();
  const existing = buffers.get(key);
  if (existing) return existing;
  const promise = (async () => {
    const parts = partsFor(key);
    const ctx = audioContext();
    if (!parts) {
      if (!isResultVoiceText(key)) throw new Error("이 안내의 음성이 준비되지 않았어요. 화면의 결과를 확인해 주세요.");
      const response = await fetch("/api/voice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: key }), signal: AbortSignal.timeout(22_000) });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/")) throw new Error("음성을 불러오지 못했어요. 음성 안내 시작을 눌러 주세요.");
      return ctx.decodeAudioData(await response.arrayBuffer());
    }
    const decoded = await Promise.all(parts.map(async part => {
      const response = await fetch(files[part], { signal: AbortSignal.timeout(22_000) });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/")) throw new Error("음성을 불러오지 못했어요. 음성 안내 시작을 눌러 주세요.");
      return ctx.decodeAudioData(await response.arrayBuffer());
    }));
    if (decoded.length === 1) return decoded[0];
    const combined = ctx.createBuffer(1, decoded.reduce((n, b) => n + b.length, 0), ctx.sampleRate);
    let offset = 0;
    for (const buffer of decoded) { combined.getChannelData(0).set(buffer.getChannelData(0), offset); offset += buffer.length; }
    return combined;
  })();
  buffers.set(key, promise);
  if (buffers.size > 96) buffers.delete(buffers.keys().next().value!);
  void promise.catch(() => { if (buffers.get(key) === promise) buffers.delete(key); });
  return promise;
}

export function preloadSpeech(lines: string[]): void {
  for (const line of lines.slice(0, 3)) void loadAudio(line).catch(() => {});
}

export interface SpeakOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (message: string) => void;
  interrupt?: boolean;
}

export function speak(text: string, opts: SpeakOptions = {}): void {
  if (!text.trim()) { opts.onEnd?.(); return; }
  if (opts.interrupt !== false) cancelSpeech();
  const token = generation;
  queue = queue.then(async () => {
    if (token !== generation) return;
    try {
      const buffer = await loadAudio(text);
      if (token !== generation) return;
      const ctx = audioContext();
      if (ctx.state !== "running" && unlocking) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { await Promise.race([unlocking, new Promise<void>(resolve => { timer = setTimeout(resolve, 1500); })]); }
        finally { clearTimeout(timer); }
      }
      if (token !== generation) return;
      if (ctx.state !== "running") throw new Error("소리를 켜려면 음성 안내 시작을 눌러 주세요.");
      await new Promise<void>(resolve => {
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        node.connect(ctx.destination);
        source = node;
        node.onended = () => {
          node.disconnect();
          if (source === node) source = undefined;
          if (token === generation) opts.onEnd?.();
          resolve();
        };
        node.start();
        opts.onStart?.();
      });
    } catch (error) {
      if (token !== generation) return;
      if (opts.onError) opts.onError(error instanceof Error ? error.message : "음성 안내 시작을 눌러 주세요.");
      else opts.onEnd?.();
    }
  });
}

export function cancelSpeech(): void {
  generation++;
  if (source) { source.stop(); source = undefined; }
  queue = Promise.resolve();
}

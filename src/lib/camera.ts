"use client";

import type { PixelBuffer } from "@/lib/vision";

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string; format: string }[]>;
};

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

export type CaptureResult = {
  pixels: PixelBuffer;
  thumbnail: string;
};

export const CAPTURE_SIZE = 240;
export const THUMB_SIZE = 168;

export function cameraSupport(): { getUserMedia: boolean; barcode: boolean } {
  if (typeof window === "undefined") return { getUserMedia: false, barcode: false };
  return {
    getUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
    barcode: typeof (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector === "function",
  };
}

export async function startCamera(
  video: HTMLVideoElement,
  facingMode: "environment" | "user" = "environment",
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not expose a camera API. Use the photo upload fallback.");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.muted = true;
  await video.play().catch(() => undefined);
  return stream;
}

export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function drawSquare(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  size: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  const side = Math.min(sourceWidth, sourceHeight);
  const sx = (sourceWidth - side) / 2;
  const sy = (sourceHeight - side) / 2;
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  return canvas;
}

export function captureFromVideo(video: HTMLVideoElement): CaptureResult {
  if (!video.videoWidth) throw new Error("Camera frame not ready yet");
  const sample = drawSquare(video, video.videoWidth, video.videoHeight, CAPTURE_SIZE);
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  const image = ctx.getImageData(0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
  const thumb = sample.toDataURL("image/jpeg", 0.72);
  return {
    pixels: { data: image.data, width: image.width, height: image.height },
    thumbnail: thumb,
  };
}

export async function captureFromFile(file: File): Promise<CaptureResult> {
  const bitmap = await createImageBitmap(file);
  const sample = drawSquare(bitmap, bitmap.width, bitmap.height, CAPTURE_SIZE);
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  const image = ctx.getImageData(0, 0, CAPTURE_SIZE, CAPTURE_SIZE);
  const thumb = drawSquare(bitmap, bitmap.width, bitmap.height, THUMB_SIZE).toDataURL(
    "image/jpeg",
    0.72,
  );
  bitmap.close?.();
  return {
    pixels: { data: image.data, width: image.width, height: image.height },
    thumbnail: thumb,
  };
}

export async function readBarcode(video: HTMLVideoElement): Promise<string | null> {
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (typeof ctor !== "function" || !video.videoWidth) return null;
  try {
    const detector = new ctor({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"],
    });
    const results = await detector.detect(video);
    return results.length ? results[0].rawValue : null;
  } catch {
    return null;
  }
}

let audioCtx: AudioContext | null = null;

export function feedbackBeep(kind: "detected" | "error" = "detected") {
  if (typeof window === "undefined") return;
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioCtx = audioCtx ?? new Ctor();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = kind === "detected" ? "sine" : "square";
    osc.frequency.value = kind === "detected" ? 1180 : 320;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.16);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.18);
  } catch {
    /* audio is best-effort */
  }
}

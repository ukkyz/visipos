"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  cameraSupport,
  captureFromFile,
  captureFromVideo,
  readBarcode,
  startCamera,
  stopCamera,
} from "@/lib/camera";
import { computeDescriptor, type ProductDescriptor } from "@/lib/vision";
import type { DetectResponse } from "@/lib/types";
import { formatPercent } from "@/lib/money";

export type ScanCapture = {
  descriptor: ProductDescriptor;
  thumbnail: string;
  barcode: string | null;
};

type Props = {
  mode: "pos" | "enroll";
  threshold?: number;
  onThresholdChange?: (value: number) => void;
  onDetect?: (response: DetectResponse, capture: ScanCapture) => void;
  onCapture?: (capture: ScanCapture, origin: "camera" | "upload") => void;
  autoLoop?: boolean;
  intervalMs?: number;
  probe?: boolean;
  heightClass?: string;
  onBusyChange?: (busy: boolean) => void;
  children?: React.ReactNode;
};

export function CameraScanner({
  mode,
  threshold = 0.66,
  onThresholdChange,
  onDetect,
  onCapture,
  autoLoop = true,
  intervalMs = 1400,
  probe = false,
  heightClass = "h-[340px] sm:h-[420px]",
  onBusyChange,
  children,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busyRef = useRef(false);
  const lastSentRef = useRef(0);

  const [streaming, setStreaming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<DetectResponse | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [support, setSupport] = useState<{ getUserMedia: boolean; barcode: boolean }>({
    getUserMedia: false,
    barcode: false,
  });

  useEffect(() => {
    setSupport(cameraSupport());
  }, []);

  const attach = useCallback(
    async (mode2: "environment" | "user") => {
      const video = videoRef.current;
      if (!video) return;
      setStarting(true);
      setError(null);
      try {
        stopCamera(streamRef.current);
        const stream = await startCamera(video, mode2);
        streamRef.current = stream;
        setStreaming(true);
        setNotice("Camera live — hold a product inside the frame");
      } catch (err) {
        setStreaming(false);
        const message = err instanceof Error ? err.message : "Camera unavailable";
        setError(
          `${message} — you can still use the “Upload a photo” fallback below to enroll or identify products.`,
        );
      } finally {
        setStarting(false);
      }
    },
    [],
  );

  useEffect(() => {
    return () => {
      stopCamera(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const runFrame = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !streaming || busyRef.current) return;
    if (!video.videoWidth) return;
    busyRef.current = true;
    onBusyChange?.(true);
    try {
      const capture = captureFromVideo(video);
      const descriptor = computeDescriptor(capture.pixels);
      const barcode = support.barcode ? await readBarcode(video) : null;
      setPreview(capture.thumbnail);
      const shouldDetect = mode === "pos" || probe;
      if (!shouldDetect) {
        onCapture?.({ descriptor, thumbnail: capture.thumbnail, barcode }, "camera");
        return;
      }
      const response = await fetch("/api/detect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          descriptor,
          barcode,
          threshold,
          context: mode === "pos" ? "pos" : "enroll",
          log: mode === "pos",
        }),
      });
      const data = (await response.json()) as DetectResponse;
      setResult(data);
      onDetect?.(data, { descriptor, thumbnail: capture.thumbnail, barcode });
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Frame processing failed");
    } finally {
      busyRef.current = false;
      onBusyChange?.(false);
    }
  }, [mode, onBusyChange, onCapture, onDetect, probe, streaming, support.barcode, threshold]);

  useEffect(() => {
    if (!streaming || !autoLoop) return;
    const timer = setInterval(() => {
      void runFrame();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [autoLoop, intervalMs, runFrame, streaming]);

  const handleUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const capture = await captureFromFile(file);
      const descriptor = computeDescriptor(capture.pixels);
      setPreview(capture.thumbnail);
      const payload: ScanCapture = { descriptor, thumbnail: capture.thumbnail, barcode: null };
      if (mode === "pos" || probe) {
        const response = await fetch("/api/detect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            descriptor,
            threshold,
            context: mode === "pos" ? "pos" : "enroll",
            log: mode === "pos",
          }),
        });
        const data = (await response.json()) as DetectResponse;
        setResult(data);
        onDetect?.(data, payload);
      } else {
        onCapture?.(payload, "upload");
      }
      setNotice(`Processed photo “${file.name}”`);
    } catch {
      setError("Could not read that image file.");
    }
  };

  const best = result?.match ?? null;
  const top = result?.runnersUp?.[0] ?? null;
  const confidencePct = best ? best.confidence : top ? top.confidence : 0;

  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className={`relative w-full ${heightClass} bg-slate-950`}>
        <video
          ref={videoRef}
          className={`h-full w-full object-cover ${facing === "user" ? "scale-x-[-1]" : ""} ${
            streaming ? "opacity-100" : "opacity-30"
          }`}
        />

        {/* framing guides */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-6 rounded-2xl border border-emerald-400/30" />
          {streaming ? <div className="animate-scanline absolute inset-x-6 h-px bg-emerald-300/80 shadow-[0_0_18px_2px_rgba(16,185,129,0.7)]" /> : null}
          {[
            "left-4 top-4 border-l-2 border-t-2",
            "right-4 top-4 border-r-2 border-t-2",
            "left-4 bottom-4 border-b-2 border-l-2",
            "right-4 bottom-4 border-b-2 border-r-2",
          ].map((cls) => (
            <span key={cls} className={`absolute h-7 w-7 rounded-[4px] border-emerald-300/80 ${cls}`} />
          ))}
        </div>

        {!streaming ? (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <div className="max-w-sm space-y-3">
              <p className="text-sm font-medium text-slate-200">
                {mode === "pos" ? "Camera off" : "Point the camera at the product"}
              </p>
              <p className="text-xs text-slate-400">
                {support.getUserMedia
                  ? "Start the camera to detect products, or upload a photo instead."
                  : "This browser has no camera API — use the photo upload fallback."}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void attach(facing)}
                  disabled={starting}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                >
                  {starting ? "Starting…" : "Start camera"}
                </button>
                <label className="cursor-pointer rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-white/10">
                  Upload a photo
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </div>
          </div>
        ) : null}

        {/* live readout */}
        <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-slate-950/70 px-2.5 py-1 text-[11px] text-slate-300">
            <span className={`h-2 w-2 rounded-full ${streaming ? "bg-emerald-400" : "bg-slate-500"}`} />
            {streaming ? "live" : "offline"}
          </span>
          {support.barcode ? (
            <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-[11px] text-sky-200">
              barcode assist
            </span>
          ) : null}
          <span className="rounded-full border border-white/15 bg-slate-950/70 px-2.5 py-1 text-[11px] text-slate-300">
            {result ? `${result.scannedFingerprints} prints` : "—"}
          </span>
        </div>

        <div className="absolute right-3 top-3 flex items-center gap-2">
          {streaming ? (
            <>
              <button
                type="button"
                onClick={() => {
                  const next = facing === "environment" ? "user" : "environment";
                  setFacing(next);
                  void attach(next);
                }}
                className="rounded-lg border border-white/15 bg-slate-950/70 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-slate-900"
              >
                flip
              </button>
              <button
                type="button"
                onClick={() => {
                  stopCamera(streamRef.current);
                  streamRef.current = null;
                  setStreaming(false);
                }}
                className="rounded-lg border border-rose-400/30 bg-rose-500/15 px-2.5 py-1 text-[11px] text-rose-200 hover:bg-rose-500/25"
              >
                stop
              </button>
            </>
          ) : null}
        </div>

        {best ? (
          <div className="animate-pop-in absolute inset-x-3 bottom-3 rounded-xl border border-emerald-400/40 bg-emerald-500/15 px-3 py-2 backdrop-blur">
            <div className="flex items-center gap-3">
              {best.product.imageData ? (
                <img
                  src={best.product.imageData}
                  alt={best.product.name}
                  className="h-10 w-10 rounded-lg object-cover"
                />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-slate-800 text-base">📦</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{best.product.name}</p>
                <p className="text-[11px] text-emerald-200">
                  {best.source === "barcode" ? "Barcode" : "Visual match"} · {best.product.sku} ·{" "}
                  {formatPercent(best.confidence)} confidence · stock {best.product.stock}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-x-3 bottom-3 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-[11px] text-slate-300 backdrop-blur">
            {error
              ? error
              : result?.message ??
                (streaming ? "Scanning… keep one item inside the frame" : "Start the camera to begin scanning")}
          </div>
        )}

        {children}
      </div>

      <div className="space-y-3 border-t border-white/10 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Match threshold</span>
            <input
              type="range"
              min={40}
              max={92}
              value={Math.round(threshold * 100)}
              onChange={(event) =>
                onThresholdChange?.(Number(event.target.value) / 100)
              }
              disabled={!onThresholdChange}
              className="h-1.5 w-36 cursor-pointer appearance-none rounded-full bg-slate-700 accent-emerald-400"
            />
            <span className="font-mono text-[11px] text-emerald-300">{formatPercent(confidencePct)}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {mode === "enroll" ? (
              <button
                type="button"
                onClick={() => void runFrame()}
                disabled={!streaming}
                className="rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40"
              >
                Capture this angle
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void runFrame()}
                disabled={!streaming}
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-white/10 disabled:opacity-40"
              >
                Scan now
              </button>
            )}
            <label className="cursor-pointer rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-white/10">
              Photo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </div>

        {notice ? <p className="text-[11px] text-slate-400">{notice}</p> : null}

        {preview ? (
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-2">
            <img src={preview} alt="captured frame" className="h-14 w-14 rounded-lg object-cover" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-slate-300">Last frame descriptor</p>
              <p className="truncate text-[11px] text-slate-500">
                {result?.runnersUp?.length
                  ? `Top candidates: ${result.runnersUp
                      .slice(0, 2)
                      .map((candidate) => `${candidate.product.sku} ${formatPercent(candidate.confidence)}`)
                      .join(" · ")}`
                  : "descriptor computed · 64-bin chroma histogram + 4×4 layout + shape"}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

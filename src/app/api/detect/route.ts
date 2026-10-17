import { NextResponse } from "next/server";
import { DEFAULT_THRESHOLD, detectProduct } from "@/server/detect";
import { isDescriptor } from "@/lib/vision";
import type { DetectResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: {
    descriptor?: unknown;
    barcode?: string | null;
    threshold?: number;
    context?: "pos" | "enroll";
    log?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  if (!isDescriptor(body.descriptor)) {
    return NextResponse.json(
      { ok: false, message: "A visual descriptor from the camera frame is required" },
      { status: 400 },
    );
  }

  const threshold =
    typeof body.threshold === "number" && Number.isFinite(body.threshold)
      ? Math.max(0.2, Math.min(0.95, body.threshold))
      : DEFAULT_THRESHOLD;

  const result = await detectProduct({
    descriptor: body.descriptor,
    barcode: body.barcode ?? null,
    threshold,
    context: body.context === "enroll" ? "enroll" : "pos",
    log: body.log,
  });

  const candidate = result.match ?? result.runnersUp[0] ?? null;

  const payload: DetectResponse = {
    ok: true,
    scannedFingerprints: result.scanned,
    match: result.match,
    runnersUp: result.runnersUp,
    ambiguousWith: result.ambiguousWith,
    threshold,
    barcode: result.barcodeHit,
    message: result.match
      ? undefined
      : result.scanned === 0
        ? "No products are enrolled for detection yet. Add one from the catalog camera."
        : result.ambiguousWith && candidate
          ? `Ambiguous: ${candidate.product.name} and ${result.ambiguousWith.product.name} score too close (${Math.round(
              candidate.confidence * 100,
            )}% vs ${Math.round(result.ambiguousWith.confidence * 100)}%). Capture another angle of the correct item.`
          : candidate
            ? `Best candidate ${candidate.product.sku} at ${Math.round(
                candidate.confidence * 100,
              )}% is below the ${Math.round(threshold * 100)}% threshold. Hold steady, move closer, or lower the sensitivity.`
            : "No confident match. Hold the item steady inside the frame.",
  };

  return NextResponse.json(payload);
}

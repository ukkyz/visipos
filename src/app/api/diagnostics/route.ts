import { NextResponse } from "next/server";
import { computeSeparation } from "@/server/diagnostics";
import { DEFAULT_THRESHOLD, MIN_MARGIN } from "@/server/detect";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await computeSeparation();
  return NextResponse.json({
    ok: true,
    threshold: DEFAULT_THRESHOLD,
    margin: MIN_MARGIN,
    ...report,
  });
}

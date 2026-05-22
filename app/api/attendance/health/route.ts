import { NextResponse } from "next/server";

const healthUrl = "http://127.0.0.1:4000/health";

export async function GET() {
  try {
    console.log(`[attendance-proxy] GET /api/attendance/health -> ${healthUrl}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const upstream = await fetch(healthUrl, {
        method: "GET",
        signal: controller.signal,
        cache: "no-store"
      });
      const payload = await upstream.json();
      return NextResponse.json(payload, { status: upstream.status });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error("[attendance-proxy] health failed", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? `Attendance health check failed: ${error.message}`
            : "Attendance health check failed"
      },
      { status: 500 }
    );
  }
}

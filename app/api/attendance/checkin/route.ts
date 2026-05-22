import { NextResponse } from "next/server";

const upstreamUrl =
  process.env.ATTENDANCE_API_URL || "http://127.0.0.1:4000/api/attendance/checkin";

export async function GET() {
  console.log("[attendance-proxy] GET /api/attendance/checkin warmup");
  return NextResponse.json({
    ok: true,
    service: "attendance-checkin-proxy",
    upstreamUrl
  });
}

export async function POST(request: Request) {
  try {
    console.log(`[attendance-proxy] POST /api/attendance/checkin -> ${upstreamUrl}`);
    const body = await request.json();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    try {
      const upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store"
      });

      const text = await upstream.text();
      let payload: unknown = null;

      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = {
          success: false,
          message: "Attendance service returned non-JSON response",
          raw: text
        };
      }

      return NextResponse.json(payload, { status: upstream.status });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.error("[attendance-proxy] checkin failed", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? `Attendance proxy failed: ${error.message}`
            : "Attendance proxy failed"
      },
      { status: 500 }
    );
  }
}

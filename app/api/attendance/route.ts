import { NextResponse } from "next/server";

import { encryptSecret } from "@/lib/attendance/crypto";
import { submitAttendance } from "@/lib/attendance/playwright-attendance";
import type { AttendanceCredentials, StoredAttendanceCredentials } from "@/lib/attendance/types";

type AttendanceRequest =
  | { action: "saveCredentials"; payload: AttendanceCredentials }
  | { action: "attend"; payload: StoredAttendanceCredentials };

export async function POST(request: Request) {
  const body = (await request.json()) as AttendanceRequest;

  if (body.action === "saveCredentials") {
    const payload = body.payload;

    if (!payload.username || !payload.password || !payload.attendancePassword) {
      return NextResponse.json({ ok: false, message: "Missing attendance credentials." }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: "Credentials encrypted successfully. Persist this object in your user profile record.",
      credentials: {
        username: payload.username,
        passwordEncrypted: encryptSecret(payload.password),
        attendancePasswordEncrypted: encryptSecret(payload.attendancePassword)
      }
    });
  }

  if (body.action === "attend") {
    const result = await submitAttendance(body.payload);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  return NextResponse.json({ ok: false, message: "Unsupported attendance action." }, { status: 400 });
}

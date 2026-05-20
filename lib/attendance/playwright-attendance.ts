import { decryptSecret } from "@/lib/attendance/crypto";
import type { AttendanceRunResult, StoredAttendanceCredentials } from "@/lib/attendance/types";

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

export async function submitAttendance(credentials: StoredAttendanceCredentials): Promise<AttendanceRunResult> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    const username = credentials.username;
    const password = decryptSecret(credentials.passwordEncrypted);
    const attendancePassword = decryptSecret(credentials.attendancePasswordEncrypted);

    await page.goto(process.env.ATTENDANCE_LOGIN_URL || "https://host-mylmats.com/login", {
      waitUntil: "domcontentloaded"
    });

    await page.fill(requiredEnv("ATTENDANCE_USERNAME_SELECTOR"), username);
    await page.fill(requiredEnv("ATTENDANCE_PASSWORD_SELECTOR"), password);
    await page.click(requiredEnv("ATTENDANCE_SUBMIT_SELECTOR"));

    await page.waitForLoadState("domcontentloaded");
    await page.fill(requiredEnv("ATTENDANCE_SECOND_PASSWORD_SELECTOR"), attendancePassword);
    await page.click(requiredEnv("ATTENDANCE_SECOND_SUBMIT_SELECTOR"));

    await page.waitForSelector(requiredEnv("ATTENDANCE_SUCCESS_SELECTOR"), {
      timeout: 15000
    });

    return {
      ok: true,
      message: "Attendance submitted successfully.",
      attendedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Attendance automation failed."
    };
  } finally {
    await browser.close();
  }
}

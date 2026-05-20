const { chromium } = require("playwright");

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

async function runAttendanceCheckin({ username, password, attendancePassword }) {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();

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
      success: true,
      message: "Attendance submitted successfully",
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Attendance automation failed"
    };
  } finally {
    await browser.close();
  }
}

module.exports = {
  runAttendanceCheckin
};

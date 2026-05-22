const { chromium } = require("playwright");

function stampLog(logs, message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  logs.push(line);
  console.log(`[attendance] ${line}`);
}

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

function selectorList(name) {
  return requiredEnv(name)
    .split("||")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function resolveSelector(page, name, logs) {
  const selectors = selectorList(name);

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "visible", timeout: 5000 });
      if (logs) {
        stampLog(logs, `${name} resolved with selector: ${selector}`);
      }
      return { locator, selector };
    } catch {
      // try the next fallback selector
    }
  }

  throw new Error(`${name} could not be resolved from configured selectors`);
}

async function fillStep(page, name, value, logs) {
  const { locator, selector } = await resolveSelector(page, name, logs);
  await locator.fill("");
  await locator.fill(value);
  if (logs) {
    stampLog(logs, `${name} filled`);
  }
  return selector;
}

async function clickStep(page, name, logs) {
  const { locator, selector } = await resolveSelector(page, name, logs);
  await locator.click();
  if (logs) {
    stampLog(logs, `${name} clicked`);
  }
  return selector;
}

async function waitForAnySelector(page, name, timeout = 15000, logs) {
  const selectors = selectorList(name);

  for (const selector of selectors) {
    try {
      await page.locator(selector).first().waitFor({ state: "visible", timeout });
      if (logs) {
        stampLog(logs, `${name} detected with selector: ${selector}`);
      }
      return selector;
    } catch {
      // try next fallback selector
    }
  }

  throw new Error(`${name} did not appear after waiting ${timeout}ms`);
}

async function runAttendanceCheckin({ username, password, attendancePassword }) {
  const logs = [];
  const browser = await chromium.launch({ headless: true });

  try {
    const effectiveAttendancePassword = attendancePassword || password;
    stampLog(logs, "Launching headless browser");
    const page = await browser.newPage();

    page.on("console", (msg) => {
      stampLog(logs, `Browser console [${msg.type()}]: ${msg.text()}`);
    });

    page.on("pageerror", (error) => {
      stampLog(logs, `Page error: ${error.message}`);
    });

    const loginUrl = process.env.ATTENDANCE_LOGIN_URL || "https://host-mylmats.com/";
    stampLog(logs, `Opening login page: ${loginUrl}`);
    await page.goto(process.env.ATTENDANCE_LOGIN_URL || "https://host-mylmats.com/", {
      waitUntil: "domcontentloaded"
    });
    stampLog(logs, `Page loaded: ${page.url()}`);

    const usernameSelector = await fillStep(page, "ATTENDANCE_USERNAME_SELECTOR", username, logs);
    const passwordSelector = await fillStep(page, "ATTENDANCE_PASSWORD_SELECTOR", password, logs);
    const firstSubmitSelector = await clickStep(page, "ATTENDANCE_SUBMIT_SELECTOR", logs);

    stampLog(logs, "Waiting for first post-login page state");
    await page.waitForLoadState("domcontentloaded");
    stampLog(logs, `After first submit landed on: ${page.url()}`);

    const secondPasswordSelector = await fillStep(
      page,
      "ATTENDANCE_SECOND_PASSWORD_SELECTOR",
      effectiveAttendancePassword,
      logs
    );
    const secondSubmitSelector = await clickStep(
      page,
      "ATTENDANCE_SECOND_SUBMIT_SELECTOR",
      logs
    );
    stampLog(logs, "Waiting for attendance success state");
    const successSelector = await waitForAnySelector(
      page,
      "ATTENDANCE_SUCCESS_SELECTOR",
      15000,
      logs
    );

    return {
      success: true,
      message: "Attendance submitted successfully",
      timestamp: new Date().toISOString(),
      logs,
      selectorsUsed: {
        usernameSelector,
        passwordSelector,
        firstSubmitSelector,
        secondPasswordSelector,
        secondSubmitSelector,
        successSelector
      }
    };
  } catch (error) {
    stampLog(
      logs,
      `Attendance automation failed: ${
        error instanceof Error ? error.message : "Unknown automation error"
      }`
    );
    return {
      success: false,
      message: error instanceof Error ? error.message : "Attendance automation failed",
      logs
    };
  } finally {
    await browser.close();
  }
}

module.exports = {
  runAttendanceCheckin
};

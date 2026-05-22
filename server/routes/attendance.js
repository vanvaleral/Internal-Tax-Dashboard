const express = require("express");

const { runAttendanceCheckin } = require("../services/attendanceService");

const router = express.Router();

router.post("/checkin", async (request, response) => {
  const { username, password, attendancePassword } = request.body || {};

  if (!username || !password) {
    return response.status(400).json({
      success: false,
      message: "username and password are required"
    });
  }

  try {
    // Demo note:
    // Credentials are intentionally used only in-memory for this request.
    // Future production storage should use encrypted-at-rest user secrets.
    const result = await runAttendanceCheckin({
      username,
      password,
      attendancePassword: attendancePassword || password
    });

    return response.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    return response.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Attendance request failed"
    });
  }
});

module.exports = router;

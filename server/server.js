const express = require("express");
const cors = require("cors");

const attendanceRouter = require("./routes/attendance");

const app = express();
const port = Number(process.env.ATTENDANCE_PORT || 4000);

app.use(cors());
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "attendance-microservice" });
});

app.use("/api/attendance", attendanceRouter);

app.listen(port, () => {
  console.log(`Attendance microservice listening on http://localhost:${port}`);
});

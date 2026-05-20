export type AttendanceCredentials = {
  username: string;
  password: string;
  attendancePassword: string;
};

export type StoredAttendanceCredentials = {
  username: string;
  passwordEncrypted: string;
  attendancePasswordEncrypted: string;
};

export type AttendanceRunResult = {
  ok: boolean;
  message: string;
  attendedAt?: string;
};

export const TASK_STATUSES = [
  "Awaiting Client Data",
  "Ready to Process",
  "Submitted Temporary",
  "Waiting Revision Data",
  "Revised & Finalized",
  "Archived"
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export type SubmissionType = "none" | "temporary" | "final";

export type TeamDivision = "Tax Team" | "Accounting Team";

export type ClientStatus = "active" | "inactive";

export type TaxType =
  | "PPh Payment"
  | "PPh Reporting"
  | "VAT Payment"
  | "VAT Reporting"
  | "Withholding Tax"
  | "Other";

export type BoardTask = {
  id: string;
  clientId: string;
  clientName: string;
  teamDivision: TeamDivision;
  periodMonth: number;
  periodYear: number;
  taxType: TaxType;
  assignedPic: string;
  status: TaskStatus;
  submissionType: SubmissionType;
  receiptNumber: string | null;
  revisionRequired: boolean;
  revisionReason: string | null;
  followUpCount: number;
  lastFollowUpAt: string | null;
  dueDate: string;
  completedAt: string | null;
  isOverdue: boolean;
};

export type DashboardStats = {
  revisionTasks: BoardTask[];
  highFollowUpClients: Array<{
    clientId: string;
    clientName: string;
    totalFollowUps: number;
  }>;
  stuckTasks: BoardTask[];
  upcomingTasks: BoardTask[];
  workloadByPic: Array<{
    assignedPic: string;
    openTasks: number;
    revisions: number;
  }>;
  revisionFrequency: Array<{
    taxType: string;
    revisionCount: number;
  }>;
  temporaryPending: BoardTask[];
};

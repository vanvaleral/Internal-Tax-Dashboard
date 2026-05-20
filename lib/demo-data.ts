import { addDays, formatISO, subDays } from "date-fns";

import type { BoardTask, DashboardStats } from "@/lib/types";

const today = new Date();

export const demoTasks: BoardTask[] = [
  {
    id: "task-001",
    clientId: "client-001",
    clientName: "PT Arunika Sentosa",
    teamDivision: "Tax Team",
    periodMonth: today.getMonth() + 1,
    periodYear: today.getFullYear(),
    taxType: "PPh Payment",
    assignedPic: "Nadia",
    status: "Awaiting Client Data",
    submissionType: "none",
    receiptNumber: null,
    revisionRequired: false,
    revisionReason: null,
    followUpCount: 4,
    lastFollowUpAt: formatISO(subDays(today, 1)),
    dueDate: formatISO(addDays(today, 2), { representation: "date" }),
    completedAt: null,
    isOverdue: false
  },
  {
    id: "task-002",
    clientId: "client-002",
    clientName: "CV Bumi Niaga",
    teamDivision: "Tax Team",
    periodMonth: today.getMonth() + 1,
    periodYear: today.getFullYear(),
    taxType: "VAT Reporting",
    assignedPic: "Raka",
    status: "Submitted Temporary",
    submissionType: "temporary",
    receiptNumber: "TMP-88214",
    revisionRequired: true,
    revisionReason: "Client sales invoice recap arrived incomplete.",
    followUpCount: 2,
    lastFollowUpAt: formatISO(today),
    dueDate: formatISO(subDays(today, 1), { representation: "date" }),
    completedAt: null,
    isOverdue: true
  },
  {
    id: "task-003",
    clientId: "client-003",
    clientName: "PT Nusa Prima Karya",
    teamDivision: "Tax Team",
    periodMonth: today.getMonth() + 1,
    periodYear: today.getFullYear(),
    taxType: "PPh Reporting",
    assignedPic: "Nadia",
    status: "Waiting Revision Data",
    submissionType: "temporary",
    receiptNumber: "PPH-55391",
    revisionRequired: true,
    revisionReason: "Revised payroll support still pending.",
    followUpCount: 5,
    lastFollowUpAt: formatISO(subDays(today, 2)),
    dueDate: formatISO(addDays(today, 1), { representation: "date" }),
    completedAt: null,
    isOverdue: false
  },
  {
    id: "task-004",
    clientId: "client-004",
    clientName: "PT Samudra Retail",
    teamDivision: "Tax Team",
    periodMonth: today.getMonth() + 1,
    periodYear: today.getFullYear(),
    taxType: "VAT Payment",
    assignedPic: "Mira",
    status: "Ready to Process",
    submissionType: "none",
    receiptNumber: null,
    revisionRequired: false,
    revisionReason: null,
    followUpCount: 1,
    lastFollowUpAt: formatISO(subDays(today, 4)),
    dueDate: formatISO(addDays(today, 3), { representation: "date" }),
    completedAt: null,
    isOverdue: false
  },
  {
    id: "task-005",
    clientId: "client-005",
    clientName: "PT Delta Boga",
    teamDivision: "Tax Team",
    periodMonth: today.getMonth(),
    periodYear: today.getFullYear(),
    taxType: "Withholding Tax",
    assignedPic: "Raka",
    status: "Revised & Finalized",
    submissionType: "final",
    receiptNumber: "FNL-10388",
    revisionRequired: false,
    revisionReason: null,
    followUpCount: 3,
    lastFollowUpAt: formatISO(subDays(today, 10)),
    dueDate: formatISO(subDays(today, 8), { representation: "date" }),
    completedAt: formatISO(subDays(today, 7)),
    isOverdue: false
  },
  {
    id: "task-006",
    clientId: "client-002",
    clientName: "CV Bumi Niaga",
    teamDivision: "Tax Team",
    periodMonth: today.getMonth() + 1,
    periodYear: today.getFullYear(),
    taxType: "PPh Payment",
    assignedPic: "Mira",
    status: "Archived",
    submissionType: "final",
    receiptNumber: "ARC-22014",
    revisionRequired: false,
    revisionReason: null,
    followUpCount: 0,
    lastFollowUpAt: null,
    dueDate: formatISO(subDays(today, 20), { representation: "date" }),
    completedAt: formatISO(subDays(today, 18)),
    isOverdue: false
  }
];

export const demoDashboard: DashboardStats = {
  revisionTasks: demoTasks.filter((task) => task.revisionRequired),
  highFollowUpClients: [
    { clientId: "client-003", clientName: "PT Nusa Prima Karya", totalFollowUps: 5 },
    { clientId: "client-001", clientName: "PT Arunika Sentosa", totalFollowUps: 4 },
    { clientId: "client-005", clientName: "PT Delta Boga", totalFollowUps: 3 }
  ],
  stuckTasks: demoTasks.filter((task) => task.status === "Awaiting Client Data"),
  upcomingTasks: demoTasks.filter((task) => task.status !== "Archived").slice(0, 4),
  workloadByPic: [
    { assignedPic: "Nadia", openTasks: 2, revisions: 1 },
    { assignedPic: "Raka", openTasks: 2, revisions: 1 },
    { assignedPic: "Mira", openTasks: 1, revisions: 0 }
  ],
  revisionFrequency: [
    { taxType: "PPh Reporting", revisionCount: 1 },
    { taxType: "VAT Reporting", revisionCount: 1 }
  ],
  temporaryPending: demoTasks.filter((task) => task.status === "Submitted Temporary")
};

import { clsx } from "clsx";
import { format } from "date-fns";

import type { TaskStatus } from "@/lib/types";

export function cn(...inputs: Array<string | false | null | undefined>) {
  return clsx(inputs);
}

export function formatPeriod(month: number, year: number) {
  return format(new Date(year, month - 1, 1), "MMM yyyy");
}

export function statusTone(status: TaskStatus) {
  switch (status) {
    case "Awaiting Client Data":
      return "bg-warningSoft text-warning";
    case "Ready to Process":
      return "bg-accentSoft text-accent";
    case "Submitted Temporary":
      return "bg-slate-200 text-slate-700";
    case "Waiting Revision Data":
      return "bg-dangerSoft text-danger";
    case "Revised & Finalized":
      return "bg-emerald-100 text-emerald-700";
    case "Archived":
      return "bg-white text-slate-500";
  }
}

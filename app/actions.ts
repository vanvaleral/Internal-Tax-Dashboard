"use server";

import { revalidatePath } from "next/cache";

import { changeFollowUp, updateReceiptNumber, updateTaskStatus } from "@/lib/data";
import { TASK_STATUSES } from "@/lib/types";

export async function moveTask(formData: FormData) {
  const taskId = String(formData.get("taskId"));
  const status = String(formData.get("status"));

  if (!TASK_STATUSES.includes(status as (typeof TASK_STATUSES)[number])) {
    return;
  }

  await updateTaskStatus(taskId, status as (typeof TASK_STATUSES)[number]);
  revalidatePath("/");
  revalidatePath("/dashboard");
}

export async function incrementFollowUp(formData: FormData) {
  const taskId = String(formData.get("taskId"));
  await changeFollowUp(taskId, "increment");
  revalidatePath("/");
  revalidatePath("/dashboard");
}

export async function decrementFollowUp(formData: FormData) {
  const taskId = String(formData.get("taskId"));
  await changeFollowUp(taskId, "decrement");
  revalidatePath("/");
  revalidatePath("/dashboard");
}

export async function saveReceipt(formData: FormData) {
  const taskId = String(formData.get("taskId"));
  const receiptNumber = String(formData.get("receiptNumber"));
  await updateReceiptNumber(taskId, receiptNumber);
  revalidatePath("/");
}

export type TaskStep = { id: string; title: string; done: boolean };

export function taskSteps(value: unknown, taskId: string): TaskStep[] {
  return (Array.isArray(value) ? value : []).map((step, index) => ({
    id: typeof step?.id === "string" && step.id ? step.id : `legacy:${taskId}:${index}`,
    title: String(step?.title || ""), done: step?.done === true
  }));
}

export function validateTaskSteps(value: unknown, previous: unknown, taskId: string): TaskStep[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error("Use at most 500 subtasks per task.");
  const old = taskSteps(previous, taskId), ids = new Set<string>();
  return value.map((step, index) => {
    if (!step || typeof step !== "object" || Array.isArray(step) || typeof step.title !== "string" || !step.title.trim() || step.title.length > 1000 || typeof step.done !== "boolean") throw new Error("Each subtask needs a title up to 1000 characters and a completion checkbox.");
    // Older open tabs have no IDs; preserve their existing positional identity on first save.
    const id = step.id ?? old[index]?.id ?? crypto.randomUUID();
    if (typeof id !== "string" || !/^[a-zA-Z0-9:_-]{1,120}$/.test(id) || ids.has(id)) throw new Error("Subtasks must have distinct, stable IDs. Refresh and retry.");
    ids.add(id);
    return { id, title: step.title, done: step.done };
  });
}

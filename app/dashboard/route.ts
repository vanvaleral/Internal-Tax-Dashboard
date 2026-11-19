const { workspaceEntryResponse } = require("../../lib/workspace-entry.cjs");

export const dynamic = "force-static";

export function GET(): Response {
  return workspaceEntryResponse();
}

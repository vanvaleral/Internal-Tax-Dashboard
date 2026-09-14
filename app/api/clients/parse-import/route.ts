import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { currentActor, isLeadership } from "@/lib/access";
import { validateClientImportRows } from "@/lib/client-import";

export async function POST(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!isLeadership(actor.profile.role)) return NextResponse.json({ error: "Only leadership can import the client master." }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose an Excel or CSV file." }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Import files must be 8 MB or smaller." }, { status: 413 });
  let rows: Record<string, unknown>[];
  if (/\.csv$/i.test(file.name)) {
    const workbook = XLSX.read(await file.text(), { type: "string", raw: false });
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false }) as Record<string, unknown>[];
  } else {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", raw: false });
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: false }) as Record<string, unknown>[];
  }
  if (!rows.length) return NextResponse.json({ error: "The selected file has no data rows." }, { status: 422 });
  const validation = validateClientImportRows(rows);
  return NextResponse.json({ rows, validation, valid: validation.filter((entry) => !entry.errors.length).length });
}

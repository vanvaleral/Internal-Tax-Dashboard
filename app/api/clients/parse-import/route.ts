import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { canImportClientMaster, currentActor } from "@/lib/access";
import { validateClientImportRows } from "@/lib/client-import";
import { clientImportWorkbookRows } from "@/lib/client-import-workbook";

export async function POST(request: Request) {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!canImportClientMaster(actor.profile.role)) return NextResponse.json({ error: "Only a Supervisor or Leader can import the client master." }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "Choose an Excel or CSV file." }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Import files must be 8 MB or smaller." }, { status: 413 });
  const workbook = /\.csv$/i.test(file.name)
    ? XLSX.read(await file.text(), { type: "string", raw: true, cellNF: true })
    : XLSX.read(await file.arrayBuffer(), { type: "array", raw: true, cellNF: true, cellDates: false });
  const rows = clientImportWorkbookRows(workbook);
  if (!rows.length) return NextResponse.json({ error: "The selected file has no data rows." }, { status: 422 });
  const validation = validateClientImportRows(rows, { allowMissingCodes: true });
  return NextResponse.json({ rows, validation, valid: validation.filter((entry) => !entry.errors.length).length });
}

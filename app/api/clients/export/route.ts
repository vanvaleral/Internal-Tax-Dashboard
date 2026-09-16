import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { currentActor, isLeadership } from "@/lib/access";

const columns = ["clientCode", "businessForm", "name", "npwp", "industry", "address", "clientStatus", "taxOfficeRegion", "taxPic", "accountingPic", "partner", "supervisor", "contractStartedAt", "inactivatedAt", "engagementStart", "engagementEnd", "monthlyFee", "annualFee", "pph21", "unifikasi", "pph25", "phrpb1", "ppn", "notes"];

function text(value: unknown) {
  // The leading apostrophe prevents Excel from evaluating code/NPWP as a formula.
  const safe = String(value ?? "").replace(/^[=+\-@]/, "'$&");
  return safe;
}

export async function GET() {
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  if (!isLeadership(actor.profile.role)) return NextResponse.json({ error: "Only leadership can export the client master." }, { status: 403 });
  const data: any[] = [];
  for (let from = 0; ; from += 500) {
    const page = await actor.admin.from("client_master").select("*").order("legal_name").range(from, from + 499);
    if (page.error) return NextResponse.json({ error: page.error.message }, { status: 500 });
    data.push(...(page.data || []));
    if ((page.data || []).length < 500) break;
  }
  const rows = data.map((client) => ({
    clientCode: text(client.client_code), businessForm: text(client.company_form), name: text(client.legal_name), npwp: text(client.npwp), industry: text(client.industry), address: text(client.address), clientStatus: text(client.status),
    taxOfficeRegion: text(client.tax_office_region), taxPic: text(client.tax_pic_name), accountingPic: text(client.accounting_pic_name), partner: text(client.partner_name), supervisor: text(client.supervisor_name), contractStartedAt: text(client.contract_started_at), inactivatedAt: text(client.inactivated_at), engagementStart: text(client.engagement_start), engagementEnd: text(client.engagement_end),
    monthlyFee: client.monthly_fee || 0, annualFee: client.annual_fee || 0, pph21: client.has_pph21 ? "1" : "0", unifikasi: client.has_unifikasi ? "1" : "0", pph25: client.has_pph25_pp55 ? "1" : "0", phrpb1: client.has_pb1 ? "1" : "0", ppn: client.has_ppn ? "1" : "0", notes: text(client.notes)
  }));
  const sheet = XLSX.utils.json_to_sheet(rows, { header: columns });
  for (const cell of Object.values(sheet)) if (cell && typeof cell === "object" && "v" in cell && typeof cell.v === "string") cell.t = "s";
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Client Master");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(bytes, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="client-master-${new Date().toISOString().slice(0, 10)}.xlsx"`, "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";
import { currentActor } from "@/lib/access";
import { hasDelegatedOversight, readFeatureSettings } from "@/lib/feature-access";
import { readAllPages } from "@/lib/read-all-pages";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const actor = await currentActor(request);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status, headers });
  const scope = new URL(request.url).searchParams.get("scope");
  if (scope !== "clients" && scope !== "allocation") {
    return NextResponse.json({ error: "Choose a valid oversight view." }, { status: 400, headers });
  }
  try {
    const settings = await readFeatureSettings(actor.admin);
    if (!settings.ready || !hasDelegatedOversight(actor.profile, settings.policy, scope)) {
      return NextResponse.json({ error: "This read-only view is not available for your account." }, { status: 403, headers });
    }
    const data = await readAllPages((from, to) => {
      const query = actor.admin.from("client_master")
        .select("id,client_code,legal_name,company_form,status,engagement_type,tax_pic_name,accounting_pic_name", { count: "exact" })
        .order("legal_name").order("id").range(from, to);
      return scope === "allocation" ? query.eq("status", "Active") : query.in("status", ["Active", "Inactive"]);
    });
    const rows = data.map(({ client_code, legal_name, company_form, status, engagement_type, tax_pic_name, accounting_pic_name }) => ({
      code: client_code, name: legal_name, form: company_form, status, engagement: engagement_type,
      taxPic: tax_pic_name, accountingPic: accounting_pic_name
    }));
    return NextResponse.json({ rows }, { headers });
  } catch {
    return NextResponse.json({ error: "The read-only overview could not be loaded. Try again." }, { status: 503, headers });
  }
}

import { after, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createOperationalAnnouncement } from "@/lib/notifications";

export async function GET(request: Request) {
  const supabase = await createClient();

  if (!supabase) {
    return NextResponse.json({ error: "Database is not configured.", mode: "demo" }, { status: 503 });
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user && process.env.DEMO_DATABASE_READ !== "true") {
    return NextResponse.json({ error: "Authentication is required to read client data." }, { status: 401 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();
  let query = supabase
    .from("client_master")
    .select("*")
    .order("legal_name", { ascending: true });

  if (search) {
    query = query.or(`legal_name.ilike.%${search}%,client_code.ilike.%${search}%,npwp.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data, mode: "database" });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  const body = await request.json();
  const rows: Array<Record<string, any>> = Array.isArray(body.clients) ? body.clients : [];
  if (!rows.length) return NextResponse.json({ error: "No clients supplied." }, { status: 400 });
  const isBulkImport = body.operation === "bulk-import";

  const { data: profile } = await supabase
    .from("staff_profiles")
    .select("id, display_name, full_name, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (isBulkImport && (!profile || !["leader", "supervisor", "partner", "admin"].includes(String(profile.role || "").toLowerCase()))) {
    return NextResponse.json({ error: "Only leadership can import or update the client master in bulk." }, { status: 403 });
  }

  const payload = rows.map((client) => ({
    client_code: String(client.clientCode || "").trim(),
    legal_name: String(client.name || "").trim(),
    npwp: client.npwp || null,
    industry: client.industry || null,
    address: client.address || null,
    status: ["Active", "Inactive", "Proposal"].includes(client.clientStatus) ? client.clientStatus : "Active",
    tax_pic_name: client.taxPic || null,
    accounting_pic_name: client.accountingPic || null,
    monthly_fee: Number(client.serviceFee || 0),
    annual_fee: Number(client.annualFee || 0),
    engagement_start: client.engagementStart || null,
    engagement_end: client.engagementEnd || null,
    notes: client.notes || null,
    partner_name: client.partner || null,
    supervisor_name: client.supervisor || null,
    service_package: client.servicePackage || null,
    proposal_status: client.proposalStatus || null,
    company_form: client.businessForm || null,
    has_pph21: Boolean(client.obligations?.pph21?.status !== "na"),
    has_unifikasi: Boolean(client.obligations?.unifikasi?.status !== "na"),
    has_pph25_pp55: Boolean(client.obligations?.pph25?.status !== "na"),
    has_pb1: Boolean(client.obligations?.phrpb1?.status !== "na"),
    has_ppn: Boolean(client.obligations?.ppn?.status !== "na"),
    source_system: client.sourceSystem || "manual"
  })).filter((client) => client.client_code && client.legal_name);

  const uniquePayload = [...new Map(payload.map((client) => [client.client_code, client])).values()];
  const codes = uniquePayload.map((client) => client.client_code);
  const { data: existingRows, error: existingError } = codes.length
    ? await supabase.from("client_master").select("client_code").in("client_code", codes)
    : { data: [], error: null };
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });
  const existingCodes = new Set((existingRows || []).map((client) => client.client_code));

  const { data, error } = await supabase.from("client_master").upsert(uniquePayload, { onConflict: "client_code" }).select("id, client_code");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data?.length) {
    await supabase.from("client_master_activity").insert(data.map((client) => ({
      client_id: client.id,
      action: "client_master_upsert",
      new_value: { client_code: client.client_code },
      actor_user_id: user.id
    })));
  }
  const createdClients = uniquePayload.filter((client) => !existingCodes.has(client.client_code));
  if (createdClients.length && profile) {
    after(async () => {
      try {
        const preview = createdClients.slice(0, 3).map((client) => client.legal_name).join(", ");
        const suffix = createdClients.length > 3 ? ` and ${createdClients.length - 3} more` : "";
        await createOperationalAnnouncement({ title: `New clients added: ${createdClients.length}`, message: `${profile.display_name || profile.full_name} added ${preview}${suffix}.`, senderProfileId: profile.id });
      } catch (notificationError) {
        console.error("[clients] import notification could not be created", notificationError);
      }
    });
  }
  return NextResponse.json({ data, mode: "database", imported: uniquePayload.length, created: createdClients.length, updated: uniquePayload.length - createdClients.length });
}

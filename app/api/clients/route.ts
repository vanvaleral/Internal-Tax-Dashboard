import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    has_pph21: Boolean(client.obligations?.pph21?.status !== "na"),
    has_unifikasi: Boolean(client.obligations?.unifikasi?.status !== "na"),
    has_pph25_pp55: Boolean(client.obligations?.pph25?.status !== "na"),
    has_pb1: Boolean(client.obligations?.phrpb1?.status !== "na"),
    has_ppn: Boolean(client.obligations?.ppn?.status !== "na"),
    source_system: "csv-import"
  })).filter((client) => client.client_code && client.legal_name);

  const { data, error } = await supabase.from("client_master").upsert(payload, { onConflict: "client_code" }).select("id, client_code");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, mode: "database", imported: payload.length });
}

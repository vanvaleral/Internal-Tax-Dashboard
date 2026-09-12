import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function casePayload(input: Record<string, unknown>, userId: string) {
  const stage = String(input.stage || "Waiting Client Docs").trim();
  return {
    client_id: input.clientId || null,
    client_name: String(input.clientName || "").trim(),
    case_type: String(input.caseType || "Tax Consultation").trim(),
    stage,
    priority: ["Low", "Medium", "High"].includes(String(input.priority)) ? input.priority : "Medium",
    tax_pic_name: String(input.taxPic || "").trim() || null,
    accounting_pic_name: String(input.accountingPic || "").trim() || null,
    due_date: input.dueDate || null,
    notes: String(input.notes || "").trim() || null,
    next_steps: Array.isArray(input.nextSteps) ? input.nextSteps : [],
    closed_at: stage === "Closed" ? (input.closedAt || new Date().toISOString().slice(0, 10)) : null,
    created_by: userId
  };
}

export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  const { data, error } = await supabase.from("tax_cases").select("*").order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  const body = await request.json();
  const payload = casePayload(body.case || body, user.id);
  if (!payload.client_name) return NextResponse.json({ error: "Client name is required." }, { status: 400 });
  const { data, error } = await supabase.from("tax_cases").insert(payload).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  const body = await request.json();
  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Case id is required." }, { status: 400 });
  const { created_by: _createdBy, ...payload } = casePayload(body.case || body, user.id);
  const { data, error } = await supabase.from("tax_cases").update(payload).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

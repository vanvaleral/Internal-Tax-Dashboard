import { NextResponse } from "next/server";
import { currentActor } from "@/lib/access";
import { canManageAccess, parseFeaturePolicy, readFeatureSettings } from "@/lib/feature-access";

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request) {
  const actor = await currentActor(request);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status, headers });
  try { return NextResponse.json({ ...await readFeatureSettings(actor.admin), role: actor.profile.role }, { headers }); }
  catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503, headers }); }
}
export async function PUT(request: Request) {
  const actor = await currentActor(request);
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status, headers });
  if (!canManageAccess(actor.profile.role)) return NextResponse.json({ error: "Only a Supervisor or Partner can change feature access." }, { status: 403, headers });
  const body = await request.json().catch(() => null);
  let policy;
  try {
    policy = parseFeaturePolicy(body?.policy);
    if (!Number.isSafeInteger(body?.version) || body.version < 1) throw new Error("Refresh settings before saving.");
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400, headers }); }
  const { data, error } = await actor.admin.rpc("save_feature_access_settings", { actor_id: actor.profile.id, expected_version: body.version, next_policy: policy });
  if (error) return NextResponse.json({ error: error.code === "40001" ? "Settings changed in another session. Reload and review before saving." : "Access settings could not be saved. Verify the feature-access migration is installed." }, { status: error.code === "40001" ? 409 : 503, headers });
  return NextResponse.json({ policy, version: data, ready: true }, { headers });
}

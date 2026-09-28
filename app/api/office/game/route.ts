import { NextResponse } from "next/server";
import { currentActor } from "@/lib/access";

function disabled() { return process.env.VIRTUAL_OFFICE_GAME_ENABLED === "false"; }

export async function GET() {
  if (disabled()) return NextResponse.json({ error: "Mini game dinonaktifkan." }, { status: 404 });
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  const { data, error } = await actor.admin.from("virtual_office_game").select("round_number, progress, completed_rounds").eq("id", 1).single();
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ game: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST() {
  if (disabled()) return NextResponse.json({ error: "Mini game dinonaktifkan." }, { status: 404 });
  const actor = await currentActor();
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.status });
  // Compare-and-swap preserves moves when teammates click at the same time.
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: game, error: readError } = await actor.admin.from("virtual_office_game").select("round_number, progress, completed_rounds").eq("id", 1).single();
    if (readError || !game) return NextResponse.json({ error: readError?.message || "Game unavailable." }, { status: 500 });
    const complete = game.progress === 11;
    const { data, error } = await actor.admin.from("virtual_office_game").update({ round_number: game.round_number + (complete ? 1 : 0), progress: complete ? 0 : game.progress + 1, completed_rounds: game.completed_rounds + (complete ? 1 : 0), updated_at: new Date().toISOString() }).eq("id", 1).eq("round_number", game.round_number).eq("progress", game.progress).select("round_number, progress, completed_rounds").maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (data) return NextResponse.json({ game: data });
  }
  return NextResponse.json({ error: "Permainan sibuk. Coba lagi." }, { status: 409 });
}

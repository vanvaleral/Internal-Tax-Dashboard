import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") || "/onboarding";
  const supabase = await createClient();

  if (!supabase || !code) {
    return NextResponse.redirect(new URL("/login?error=invalid_invitation", requestUrl.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=invitation_expired", requestUrl.origin));
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}

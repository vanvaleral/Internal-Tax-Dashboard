import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

type CookieMutation = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  // The handler authenticates this exact scheduler route with CRON_SECRET.
  if (["/api/maintenance/purge-deleted", "/api/maintenance/deliver-notifications"].includes(request.nextUrl.pathname)) return response;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookieValues: CookieMutation[]) {
        cookieValues.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const pathname = request.nextUrl.pathname;
  const publicPath = pathname === "/login" || pathname.startsWith("/auth/") || pathname.startsWith("/api/auth/") || pathname === "/onboarding";
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    console.error("[auth middleware] Supabase request failed", error);
    if (publicPath || pathname.startsWith("/_next/") || pathname.startsWith("/api/health/")) return response;
    return NextResponse.redirect(new URL("/login?error=auth-unavailable", request.url));
  }
  if (!user && !publicPath && !pathname.startsWith("/_next/") && !pathname.startsWith("/api/health/")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && !publicPath && !pathname.startsWith("/_next/")) {
    const workspaceUser = request.headers.get("x-workspace-user");
    if (workspaceUser && workspaceUser !== user.id) return NextResponse.json({ error: "The signed-in account changed. Reload before continuing." }, { status: 409 });
    const { data: profile, error } = await supabase.from("staff_profiles").select("directory_active").eq("auth_user_id", user.id).maybeSingle();
    if (error || profile?.directory_active !== true) {
      return pathname.startsWith("/api/")
        ? NextResponse.json({ error: "Active staff access is required." }, { status: 403 })
        : NextResponse.redirect(new URL("/login?error=staff-access-disabled", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};

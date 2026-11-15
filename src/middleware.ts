import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAdminPath, isProtectedPath } from "@/lib/paths";

/**
 * Keeps the Supabase session fresh and guards the signed-in and admin routes:
 * signed out → /login, email not verified → /verify-email, suspended → signed out,
 * not an admin on /admin → 403.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const guarded = isProtectedPath(pathname);
  const isApi = pathname.startsWith("/api/");

  const deny = (status: 401 | 403, to: string, params: Record<string, string> = {}) => {
    if (isApi) return NextResponse.json({ error: status === 401 ? "Not signed in" : "Forbidden" }, { status });
    const dest = request.nextUrl.clone();
    dest.pathname = to;
    dest.search = "";
    for (const [k, v] of Object.entries(params)) dest.searchParams.set(k, v);
    return NextResponse.redirect(dest);
  };

  if (!url || !key) {
    // Supabase not configured yet: nothing behind the login can work, so keep it closed.
    return guarded ? deny(401, "/login", { error: "not_configured" }) : NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() checks the token with Supabase; never trust the cookie contents alone.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!guarded) return response;

  if (!user) return deny(401, "/login", { next: pathname + request.nextUrl.search });
  if (!user.email_confirmed_at) return deny(403, "/verify-email");

  const { data: profile } = await supabase
    .from("profiles_user")
    .select("is_admin, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    const out = deny(403, "/login", { error: "suspended" });
    response.cookies.getAll().forEach((c) => out.cookies.set(c));
    return out;
  }

  if (isAdminPath(pathname) && !profile.is_admin) {
    if (isApi) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const dest = request.nextUrl.clone();
    dest.pathname = "/forbidden";
    dest.search = "";
    return NextResponse.rewrite(dest, { status: 403 });
  }

  return response;
}

export const config = {
  // Everything except static files and images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

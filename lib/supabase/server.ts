import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

type CookieMutation = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return null;
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookieValues: CookieMutation[]) {
        try {
          cookieValues.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server components can read cookies but not always mutate them.
        }
      }
    }
  });
}

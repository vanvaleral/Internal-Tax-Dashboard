import { redirect } from "next/navigation";
import { DemoFrame } from "@/components/demo/demo-frame";
import { createClient } from "@/lib/supabase/server";

export default async function BoardPage() {
  const supabase = await createClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const { data: profile } = await supabase.from("staff_profiles").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!profile) redirect("/onboarding");
  }
  return (
    <DemoFrame />
  );
}

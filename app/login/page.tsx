import { LoginForm } from "@/components/auth/login-form";

// Fresh request nonces are limited to auth pages; the dashboard stays static.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm />;
}

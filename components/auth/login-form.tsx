"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberIdentifier, setRememberIdentifier] = useState(true);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const savedIdentifier = window.localStorage.getItem("tax-practice-login-identifier");
    if (savedIdentifier) setIdentifier(savedIdentifier);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const supabase = createClient();
    if (!supabase) {
      setMessage("Supabase is not configured in this environment.");
      setSubmitting(false);
      return;
    }
    let email = identifier.trim();
    if (!email.includes("@")) {
      const resolved = await fetch("/api/auth/resolve-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: email })
      });
      const result = await resolved.json().catch(() => ({}));
      if (!resolved.ok || !result.email) {
        setMessage(result.error || "Invalid username or password.");
        setSubmitting(false);
        return;
      }
      email = result.email;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message === "Invalid login credentials" ? "Email or password is incorrect. A display name cannot be used to sign in." : error.message);
      setSubmitting(false);
      return;
    }
    if (rememberIdentifier) {
      window.localStorage.setItem("tax-practice-login-identifier", identifier.trim());
    } else {
      window.localStorage.removeItem("tax-practice-login-identifier");
    }
    window.location.href = "/";
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="eyebrow">Tax Firm Operating System</div>
        <h1>Sign in</h1>
        <p className="auth-copy">Use your email address or username and password.</p>
        <form onSubmit={submit} className="auth-form">
          <label>Email or username<input value={identifier} onChange={(event) => setIdentifier(event.target.value)} required autoComplete="username" placeholder="name@company.com or username" /></label>
          <label>Password
            <span className="password-field">
              <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" placeholder="Your password" />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>
            </span>
          </label>
          <label className="remember-identifier"><input type="checkbox" checked={rememberIdentifier} onChange={(event) => setRememberIdentifier(event.target.checked)} /> Remember my username on this device</label>
          <p className="auth-hint">Your password is never stored here. A secure Supabase session keeps you signed in after login.</p>
          <button className="solid-btn auth-submit" disabled={submitting}>{submitting ? "Signing in..." : "Sign in"}</button>
          {message && <div className="auth-message is-error">{message}</div>}
        </form>
      </section>
    </main>
  );
}

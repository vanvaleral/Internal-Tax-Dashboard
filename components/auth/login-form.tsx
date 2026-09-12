"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Registration = {
  fullName: string;
  username: string;
  teamDivision: string;
  email: string;
  password: string;
  confirmPassword: string;
  referralCode: string;
};

export function LoginForm() {
  const [mode, setMode] = useState<"sign-in" | "register">("sign-in");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberIdentifier, setRememberIdentifier] = useState(true);
  const [registration, setRegistration] = useState<Registration>({ fullName: "", username: "", teamDivision: "Tax Team", email: "", password: "", confirmPassword: "", referralCode: "" });
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const savedIdentifier = window.localStorage.getItem("tax-practice-login-identifier");
    if (savedIdentifier) setIdentifier(savedIdentifier);
  }, []);

  function updateRegistration(field: keyof Registration, value: string) {
    setRegistration((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    const supabase = createClient();
    if (!supabase) {
      setMessage("Supabase is not configured in this environment.");
      setSubmitting(false);
      return;
    }
    let email = identifier.trim();
    if (!email.includes("@")) {
      const resolved = await fetch("/api/auth/resolve-username", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: email }) });
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
    if (rememberIdentifier) window.localStorage.setItem("tax-practice-login-identifier", identifier.trim());
    else window.localStorage.removeItem("tax-practice-login-identifier");
    window.location.href = "/";
  }

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (registration.password !== registration.confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(registration) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(result.error || "Account could not be created. Please try again.");
      setSubmitting(false);
      return;
    }
    const supabase = createClient();
    if (!supabase) {
      setMode("sign-in");
      setIdentifier(registration.username);
      setMessage("Account created. Please sign in after Supabase has been configured.");
      setSubmitting(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: result.email, password: registration.password });
    if (error) {
      setMode("sign-in");
      setIdentifier(registration.username);
      setPassword("");
      setMessage("Account created. Please sign in using your username and password.");
      setSubmitting(false);
      return;
    }
    if (rememberIdentifier) window.localStorage.setItem("tax-practice-login-identifier", registration.username);
    window.location.href = "/";
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="eyebrow">Tax Firm Operating System</div>
        <h1>{mode === "sign-in" ? "Sign in" : "Create account"}</h1>
        <p className="auth-copy">{mode === "sign-in" ? "Use your email address or username and password." : "Create a staff account with the referral code provided by your supervisor."}</p>
        {mode === "sign-in" ? (
          <form onSubmit={submit} className="auth-form">
            <label>Email or username<input value={identifier} onChange={(event) => setIdentifier(event.target.value)} required autoComplete="username" placeholder="name@company.com or username" /></label>
            <label>Password<span className="password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" placeholder="Your password" /><button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></span></label>
            <label className="remember-identifier"><input type="checkbox" checked={rememberIdentifier} onChange={(event) => setRememberIdentifier(event.target.checked)} /> Remember my username on this device</label>
            <p className="auth-hint">Your password is never stored here. A secure Supabase session keeps you signed in after login.</p>
            <button className="solid-btn auth-submit" disabled={submitting}>{submitting ? "Signing in..." : "Sign in"}</button>
            <button type="button" className="auth-mode-button" onClick={() => { setMode("register"); setMessage(""); }}>New staff member? Register with a referral code.</button>
            {message && <div className="auth-message is-error">{message}</div>}
          </form>
        ) : (
          <form onSubmit={register} className="auth-form">
            <label>Full name<input value={registration.fullName} onChange={(event) => updateRegistration("fullName", event.target.value)} required autoComplete="name" placeholder="Your full name" /></label>
            <label>Username<input value={registration.username} onChange={(event) => updateRegistration("username", event.target.value.toLowerCase())} required minLength={3} maxLength={40} autoComplete="username" placeholder="lowercase username" /></label>
            <label>Team<select value={registration.teamDivision} onChange={(event) => updateRegistration("teamDivision", event.target.value)}><option>Tax Team</option><option>Accounting Team</option></select></label>
            <label>Email address<input type="email" value={registration.email} onChange={(event) => updateRegistration("email", event.target.value)} required autoComplete="email" placeholder="name@company.com" /></label>
            <label>Password<span className="password-field"><input type={showPassword ? "text" : "password"} value={registration.password} onChange={(event) => updateRegistration("password", event.target.value)} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" /><button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button></span></label>
            <label>Confirm password<input type={showPassword ? "text" : "password"} value={registration.confirmPassword} onChange={(event) => updateRegistration("confirmPassword", event.target.value)} required autoComplete="new-password" placeholder="Repeat password" /></label>
            <label>Referral code<input value={registration.referralCode} onChange={(event) => updateRegistration("referralCode", event.target.value)} required autoComplete="off" placeholder="Enter referral code" /></label>
            <button className="solid-btn auth-submit" disabled={submitting}>{submitting ? "Creating account..." : "Create account"}</button>
            <button type="button" className="auth-mode-button" onClick={() => { setMode("sign-in"); setMessage(""); }}>Already have an account? Sign in.</button>
            {message && <div className="auth-message is-error">{message}</div>}
          </form>
        )}
      </section>
    </main>
  );
}

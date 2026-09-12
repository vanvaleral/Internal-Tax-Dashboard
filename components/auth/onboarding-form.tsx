"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function OnboardingForm() {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [teamDivision, setTeamDivision] = useState("Tax Team");
  const [message, setMessage] = useState("Loading your invitation...");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      if (!supabase) {
        setMessage("Supabase is not configured.");
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = "/login?error=invite_session_missing";
        return;
      }
      if (!active) return;
      setEmail(user.email || "");
      const response = await fetch("/api/profile");
      if (response.ok) {
        const result = await response.json();
        if (result.profile?.full_name) setFullName(result.profile.full_name);
        if (result.profile?.username) setUsername(result.profile.username);
        if (result.profile?.team_division) setTeamDivision(result.profile.team_division);
        if (result.profile?.full_name) setMessage("Your profile is ready to review.");
        else setMessage("Complete your profile before entering the workspace.");
      } else {
        setMessage("Complete your profile before entering the workspace.");
      }
    })();
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("Saving profile...");
    const response = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, username, teamDivision })
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setMessage(result.error || "Profile could not be saved.");
      setSaving(false);
      return;
    }
    window.location.href = "/";
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="eyebrow">Tax Firm Operating System</div>
        <h1>Complete your profile</h1>
        <p className="auth-copy">Your invitation is accepted. Add your name, username, and team before entering the workspace.</p>
        <form onSubmit={submit} className="auth-form">
          <label>Email address<input value={email} readOnly /></label>
          <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} required minLength={2} placeholder="Your full name" /></label>
          <label>Username<input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} required minLength={3} placeholder="e.g. ivan" pattern="[a-z0-9._-]{3,40}" /></label>
          <label>Team<select value={teamDivision} onChange={(event) => setTeamDivision(event.target.value)}><option>Tax Team</option><option>Accounting Team</option></select></label>
          <p className="auth-hint">Your initial role is Staff. A Supervisor can update your access later.</p>
          <button className="solid-btn auth-submit" disabled={saving}>{saving ? "Saving..." : "Enter workspace"}</button>
          <div className="auth-message">{message}</div>
        </form>
      </section>
    </main>
  );
}

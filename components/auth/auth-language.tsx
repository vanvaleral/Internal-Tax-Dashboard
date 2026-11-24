"use client";

import { useEffect, useState } from "react";
import { languageStorageKey, translateAuth, type AuthLanguage } from "@/lib/auth-language";

export function useAuthLanguage() {
  const [language, setLanguage] = useState<AuthLanguage>("en");
  useEffect(() => {
    const refresh = () => {
      try { setLanguage(localStorage.getItem(languageStorageKey) === "id" ? "id" : "en"); }
      catch { setLanguage("en"); }
    };
    const onStorage = (event: StorageEvent) => { if (event.key === languageStorageKey) refresh(); };
    refresh();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  return {
    language,
    t: (message: string, fallback?: string) => translateAuth(language, message, fallback),
    choose(next: AuthLanguage) {
      setLanguage(next);
      try { localStorage.setItem(languageStorageKey, next); } catch {}
    }
  };
}

export function AuthLanguageSwitch({ language, choose }: { language: AuthLanguage; choose: (next: AuthLanguage) => void }) {
  return <div className="auth-language" role="group" aria-label={language === "id" ? "Bahasa" : "Language"}>
    <button type="button" lang="en" aria-pressed={language === "en"} onClick={() => choose("en")}>EN</button>
    <button type="button" lang="id" aria-pressed={language === "id"} onClick={() => choose("id")}>ID</button>
  </div>;
}

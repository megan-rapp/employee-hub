"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export default function SignIn({ authError = false }: { authError?: boolean }) {
  const [notice, setNotice] = useState(
    authError ? "That sign-in link has expired or is invalid. Request a new one." : "",
  );
  const [pending, setPending] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNotice("");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const { error } = await createClient().auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    setPending(false);
    if (error) {
      setNotice("Could not send a sign-in link. Check the email address and try again.");
      return;
    }

    setNotice("If an invited account exists for this address, a sign-in link will arrive shortly.");
  }

  return (
    <main className="auth-page">
      <section aria-labelledby="sign-in-title" className="auth-card">
        <span className="eyebrow">EMPLOYEE HUB</span>
        <h1 id="sign-in-title">Sign in with email</h1>
        <p>Enter the email address invited by your practice administrator. We&apos;ll send you a secure sign-in link.</p>
        <form onSubmit={signIn}>
          <label>
            Email
            <input autoComplete="email" autoFocus name="email" required type="email" />
          </label>
          {notice && <div className="auth-error" role="alert">{notice}</div>}
          <button className="primary-button" disabled={pending} type="submit">
            {pending ? "Sending link..." : "Send sign-in link"}
          </button>
        </form>
        <p className="auth-footnote">Only accounts created by a practice administrator can sign in.</p>
      </section>
    </main>
  );
}

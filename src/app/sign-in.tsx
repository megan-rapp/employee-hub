"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function SignIn() {
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setNotice("");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email")).trim();
    const password = String(formData.get("password"));
    const { error } = await createClient().auth.signInWithPassword({
      email,
      password,
    });

    setPending(false);
    if (error) {
      setNotice("Sign-in failed. Check your email and password, then try again.");
      return;
    }

    router.refresh();
  }

  return (
    <main className="auth-page">
      <section aria-labelledby="sign-in-title" className="auth-card">
        <span className="eyebrow">EMPLOYEE HUB</span>
        <h1 id="sign-in-title">Practice sign in</h1>
        <p>Sign in with the account invited by your practice administrator.</p>
        <form onSubmit={signIn}>
          <label>
            Email
            <input autoComplete="email" autoFocus name="email" required type="email" />
          </label>
          <label>
            Password
            <input autoComplete="current-password" name="password" required type="password" />
          </label>
          {notice && <div className="auth-error" role="alert">{notice}</div>}
          <button className="primary-button" disabled={pending} type="submit">
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="auth-footnote">Account creation is restricted to practice administrators.</p>
      </section>
    </main>
  );
}

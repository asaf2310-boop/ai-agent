"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  email?: string | null;
};

export function AuthHeader({ email }: Props) {
  const [userEmail, setUserEmail] = useState(email || "");

  useEffect(() => {
    if (email) return;
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || "");
    });
  }, [email]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3 text-sm">
      <span className="text-[var(--muted)] truncate">
        {userEmail ? `מחובר: ${userEmail}` : "מחובר"}
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        className="rounded-md border border-[var(--border)] px-3 py-1.5 hover:bg-[var(--surface)]"
      >
        התנתק
      </button>
    </div>
  );
}

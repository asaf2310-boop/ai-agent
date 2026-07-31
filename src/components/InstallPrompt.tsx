"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function detectIos() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null,
  );
  const [visible, setVisible] = useState(false);
  const [isIos] = useState(detectIos);

  useEffect(() => {
    const dismissed = sessionStorage.getItem("allin-install-dismissed");
    if (isStandaloneDisplay() || dismissed) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    if (detectIos()) {
      const t = window.setTimeout(() => setVisible(true), 1200);
      return () => {
        window.clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBip);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (!visible) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setVisible(false);
    setDeferred(null);
  }

  function dismiss() {
    sessionStorage.setItem("allin-install-dismissed", "1");
    setVisible(false);
  }

  return (
    <div className="animate-rise fixed inset-x-3 bottom-[calc(var(--nav-h)+var(--safe-bottom)+0.75rem)] z-40 mx-auto max-w-lg">
      <div className="glass-panel flex items-start gap-3 rounded-2xl px-4 py-3 shadow-[0_12px_40px_rgba(12,26,34,0.18)]">
        <div
          className="brand-mark mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-[var(--accent-bright)]"
          aria-hidden
        >
          A
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">התקן את אפליקציית AllIn</p>
          <p className="text-xs leading-relaxed text-[var(--muted)]">
            {isIos && !deferred
              ? "ב־Safari: שתף ← ״הוסף למסך הבית״ לפתיחה כמו אפליקציה."
              : "גישה מהירה ממסך הבית, בלי סרגל דפדפן."}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {deferred && (
              <button
                type="button"
                onClick={() => void install()}
                className="rounded-lg bg-[var(--ink)] px-3 py-1.5 text-xs font-semibold text-white"
              >
                התקן עכשיו
              </button>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--muted)]"
            >
              אחר כך
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

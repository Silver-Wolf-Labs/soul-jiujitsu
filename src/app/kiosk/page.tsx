"use client";

import { useState } from "react";
import { unlockKiosk } from "@/lib/actions/check-ins";
import { useGymProfile } from "@/lib/gym-profile-context";
import { useKioskUi } from "@/lib/kiosk-ui-context";
import { PIN_MASK_DELAY_MS } from "@/lib/kiosk-ui-config";
import PinPad from "@/components/kiosk/PinPad";

export default function KioskPinPage() {
  const profile = useGymProfile();
  const { pinPrivacyMask } = useKioskUi();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function handleDigit(d: string) {
    if (d === "⌫") {
      setPin(p => p.slice(0, -1));
      setError("");
      return;
    }
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    setError("");
    if (next.length === 4) submit(next);
  }

  async function submit(code: string) {
    setLoading(true);
    const result = await unlockKiosk(code);
    if (result.ok) {
      // Strict-mode one-shot flag — the checkin guard consumes this on mount
      // so a refresh (which clears it) forces a fresh PIN entry. In grace
      // mode the cookie is the source of truth; this flag is harmless either
      // way since the guard only reads it when mode === "strict".
      sessionStorage.setItem("kiosk_active", "1");
      // Full page navigation ensures the cookie set by the server action is
      // committed before the next request. router.push() starts a client-side
      // fetch that can race ahead of cookie persistence, causing middleware to
      // see a missing kiosk_token and bounce back to the PIN page.
      window.location.href = "/kiosk/checkin";
    } else {
      setError(result.error ?? "Incorrect PIN");
      setPin("");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 select-none">
      <div className="w-64">
        <PinPad
          code={pin}
          onDigit={handleDigit}
          busy={loading}
          error={error}
          privacyMask={pinPrivacyMask}
          maskDelayMs={PIN_MASK_DELAY_MS}
          header={
            <div className="mb-10 text-center">
              <div className="font-display text-4xl text-white tracking-wide">
                {profile.logoText}
                <span className="text-yellow">{profile.logoDot}</span>
                {" "}{profile.cityName}
              </div>
              <p className="text-white/40 text-sm mt-2 font-mono tracking-widest uppercase">
                Front Desk Kiosk
              </p>
            </div>
          }
          footer={
            <p className="text-white/20 text-xs mt-10 font-mono">
              Enter the kiosk PIN to unlock
            </p>
          }
        />
      </div>
    </div>
  );
}

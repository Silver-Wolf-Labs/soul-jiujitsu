"use client";

import BeltVisual from "@/components/ui/BeltVisual";
import { BeltColor, BELT_BUTTON_CLASSES } from "@/lib/constants";

const BELTS = Object.values(BeltColor) as BeltColor[];

export interface BeltEditorValue {
  belt: string;
  stripes: number;
  /** ISO date "YYYY-MM-DD" or empty string for unset. */
  beltAwardedAt: string;
  /** ISO date "YYYY-MM-DD" or empty string for unset. */
  trainingStartedAt: string;
}

interface Props {
  value: BeltEditorValue;
  onChange: (next: BeltEditorValue) => void;
  /** Optional helper line shown above the controls. */
  description?: string;
  /** When true, hides the training-start input (signup shows it; some admin
   *  contexts might want to scope this editor to belt fields only). */
  hideTrainingStarted?: boolean;
}

/**
 * Shared belt editor used on the signup flow and the admin member detail
 * page.  Renders a live BeltVisual at the top that updates as the caller
 * flips belt / stripes, followed by the same control set both surfaces
 * showed before this was extracted.
 *
 * Controlled component — the parent owns state and receives the full
 * object on every change.  That keeps this file free of validation /
 * submit logic; the surrounding form decides what to do with the values.
 */
export default function BeltEditor({
  value,
  onChange,
  description,
  hideTrainingStarted = false,
}: Props) {
  const { belt, stripes, beltAwardedAt, trainingStartedAt } = value;
  const today = new Date().toISOString().slice(0, 10);
  const label = "block text-xs font-semibold text-muted uppercase tracking-wide mb-2";

  function update(patch: Partial<BeltEditorValue>) {
    onChange({ ...value, ...patch });
  }

  return (
    <div>
      {description && (
        <p className="text-xs text-muted mb-3">{description}</p>
      )}

      {/* Live preview */}
      <div className="mb-5">
        <div className={label}>Current Rank</div>
        <BeltVisual belt={belt} stripes={stripes} className="w-full max-w-sm" />
        <div className="mt-2 text-sm text-ink">
          <span className="capitalize">{belt}</span> belt
          {stripes > 0 && (
            <span className="text-muted"> &middot; {stripes} {stripes === 1 ? "stripe" : "stripes"}</span>
          )}
        </div>
      </div>

      {/* Belt selector */}
      <div className="mb-5">
        <label className={label}>Current Belt</label>
        <div className="flex gap-2 flex-wrap">
          {BELTS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => {
                // Reset stripes to 0 when belt changes so the preview doesn't
                // show stripes from the prior belt, which is always wrong.
                // Also clear beltAwardedAt when transitioning to white — a
                // white belt has no awarding event, so the date field is
                // hidden below and must not retain a stale value.
                //
                // When moving away from black and the stripe count was 5 or
                // 6, clamp to 4 (new ceiling) — but we already reset to 0
                // below so this is implicitly handled.
                update({
                  belt: b,
                  stripes: 0,
                  beltAwardedAt: b === "white" ? "" : beltAwardedAt,
                });
              }}
              className={`px-3 py-1.5 rounded border text-xs font-semibold capitalize transition-all ${
                belt === b
                  ? BELT_BUTTON_CLASSES[b] + " ring-2 ring-offset-1 ring-black/30"
                  : "bg-white border-line text-muted hover:border-black"
              }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {/* Stripes — colored belts cap at 4, black belt goes to 6 (the
          standard BJJ degree progression through 6th-degree black). */}
      <div className="mb-5">
        <label className={label}>Stripes</label>
        <div className="flex gap-2 flex-wrap">
          {(belt === "black" ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4]).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => update({ stripes: n })}
              className={`w-10 h-10 rounded border text-sm font-semibold transition-all ${
                stripes === n
                  ? "bg-black text-white border-black"
                  : "bg-white border-line text-muted hover:border-black"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Belt awarded — hidden for white belt, which has no awarding event. */}
      {belt !== "white" && (
        <div className={hideTrainingStarted ? "" : "mb-5"}>
          <label className={label} htmlFor="belt_awarded_at_input">
            Belt Awarded
          </label>
          <input
            id="belt_awarded_at_input"
            type="date"
            value={beltAwardedAt}
            onChange={(e) => update({ beltAwardedAt: e.target.value })}
            max={today}
            className="w-full sm:max-w-[11rem] border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
          />
          <p className="text-xs text-muted mt-1">Date you received this belt.</p>
        </div>
      )}

      {/* Training started */}
      {!hideTrainingStarted && (
        <div>
          <label className={label} htmlFor="training_started_at_input">
            Training Since
          </label>
          <input
            id="training_started_at_input"
            type="date"
            value={trainingStartedAt}
            onChange={(e) => update({ trainingStartedAt: e.target.value })}
            max={today}
            className="w-full sm:max-w-[11rem] border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-black"
          />
          <p className="text-xs text-muted mt-1">When you first started training BJJ.</p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Plus, X, RefreshCw } from "lucide-react";
import { badgeIcon, TIER_STYLES, CATEGORY_LABELS } from "@/lib/badges";
import {
  listBadges,
  getMemberBadges,
  awardBadge,
  revokeBadge,
  reevaluateMemberBadges,
} from "@/lib/actions/badges";
import Modal from "@/components/ui/Modal";
import ConfirmModal from "@/components/ui/ConfirmModal";
import Spinner from "@/components/ui/Spinner";
import type { Badge, EarnedBadge } from "@/lib/supabase/types";

/**
 * Admin panel for awarding and revoking badges on a member's detail page.
 *
 * The award list is sorted manual-first: the automatic badges are earned by
 * showing up and don't need a human, so what the profe actually reaches for are
 * the ones only they can give (a good submission, a first competition). Auto
 * badges stay awardable anyway — sometimes you want to recognise something the
 * rules can't see.
 */

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function MemberBadgesPanel({ memberId }: { memberId: number }) {
  const [catalogue, setCatalogue] = useState<Badge[]>([]);
  const [earned, setEarned] = useState<EarnedBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Badge | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState<EarnedBadge | null>(null);

  async function refresh() {
    try {
      const [cat, mine] = await Promise.all([listBadges(), getMemberBadges(memberId)]);
      setCatalogue(cat);
      setEarned(mine);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load badges");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  const earnedIds = new Set(earned.map((e) => e.badge.id));
  // Manual-only badges first (rule_kind IS NULL isn't exposed on the type, so we
  // approximate with category: skill + community badges are the hand-awarded
  // ones). Unearned before earned, then catalogue order.
  const awardable = catalogue
    .filter((b) => !earnedIds.has(b.id))
    .sort((a, b) => {
      const manualish = (x: Badge) => (x.category === "skill" || x.category === "community" ? 0 : 1);
      return manualish(a) - manualish(b) || a.sort_order - b.sort_order;
    });

  async function handleAward() {
    if (!selected) return;
    setSaving(true);
    const res = await awardBadge(memberId, selected.slug, note);
    setSaving(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotice(
      res.alreadyHad
        ? `${res.badgeName} — this member already had it, nothing changed.`
        : `${res.badgeName} awarded · +${res.xpAwarded} XP`,
    );
    setPickerOpen(false);
    setSelected(null);
    setNote("");
    await refresh();
  }

  async function handleRevoke() {
    if (!revoking) return;
    const target = revoking;
    // Keep `revoking` set while the request is in flight so ConfirmModal stays
    // mounted and can show its busy state; clear it only once we're done.
    const res = await revokeBadge(memberId, target.badge.id);
    setRevoking(null);

    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotice(`${target.badge.name} removed · −${target.badge.xp_reward} XP`);
    await refresh();
  }

  async function handleReevaluate() {
    setSaving(true);
    const res = await reevaluateMemberBadges(memberId);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotice(
      res.awarded.length > 0
        ? `Awarded: ${res.awarded.join(", ")}`
        : "No new badges — everything earned is already awarded.",
    );
    await refresh();
  }

  return (
    <section className="bg-white border border-line rounded-lg p-5">
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="text-sm font-semibold text-ink">
          Badges
          {earned.length > 0 && <span className="ml-1.5 font-normal text-muted">({earned.length})</span>}
        </h2>
        <div className="flex items-center gap-2">
          {/* Recovers anything the kiosk's non-fatal award missed. */}
          <button
            type="button"
            onClick={handleReevaluate}
            disabled={saving}
            title="Re-run the automatic badge rules for this member"
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
            Re-check
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-black text-white rounded text-xs font-semibold hover:bg-near-black transition-colors"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Award
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-3 text-xs text-danger bg-danger-light border border-danger-border rounded px-3 py-2">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </p>
      )}
      {notice && (
        <p className="mb-3 text-xs text-success bg-success-light border border-success-border rounded px-3 py-2">
          {notice}
          <button onClick={() => setNotice(null)} className="ml-2 underline">Dismiss</button>
        </p>
      )}

      {loading ? (
        <div className="py-4 flex justify-center"><Spinner /></div>
      ) : earned.length === 0 ? (
        <p className="text-sm text-muted">No badges yet.</p>
      ) : (
        <ul className="space-y-2.5">
          {earned.map((item) => {
            const Icon = badgeIcon(item.badge.icon);
            const tier = TIER_STYLES[item.badge.tier];
            return (
              <li key={item.badge.id} className="flex items-start gap-3">
                <span
                  className="mt-0.5 w-8 h-8 flex-none rounded-full flex items-center justify-center border"
                  style={{ backgroundColor: tier.bg, borderColor: tier.fg, color: tier.fg }}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink">{item.badge.name}</div>
                  <div className="text-xs text-muted">
                    {formatDate(item.awarded_at)}
                    {" · "}
                    {item.awarded_via === "manual" ? "awarded by hand" : "automatic"}
                    {" · +"}{item.badge.xp_reward} XP
                  </div>
                  {item.note && (
                    <div className="text-xs text-ink italic mt-0.5">&ldquo;{item.note}&rdquo;</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setRevoking(item)}
                  aria-label={`Remove ${item.badge.name}`}
                  className="flex-none text-muted hover:text-danger p-1"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={pickerOpen}
        onClose={() => { setPickerOpen(false); setSelected(null); setNote(""); }}
        title="Award a badge"
        subtitle="Hand-awarded badges carry a note the member sees in their portal."
      >
        <div className="space-y-4">
          <div className="max-h-64 overflow-y-auto -mx-1 px-1 space-y-1">
            {awardable.length === 0 ? (
              <p className="text-sm text-muted">This member already has every badge.</p>
            ) : (
              awardable.map((b) => {
                const Icon = badgeIcon(b.icon);
                const tier = TIER_STYLES[b.tier];
                const isSelected = selected?.id === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelected(b)}
                    aria-pressed={isSelected}
                    className={`w-full flex items-start gap-3 text-left p-2 rounded border transition-colors ${
                      isSelected ? "border-black bg-paper" : "border-transparent hover:bg-off-white"
                    }`}
                  >
                    <span
                      className="mt-0.5 w-8 h-8 flex-none rounded-full flex items-center justify-center border"
                      style={{ backgroundColor: tier.bg, borderColor: tier.fg, color: tier.fg }}
                    >
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{b.name}</span>
                      <span className="block text-xs text-muted">{b.description}</span>
                      <span className="block text-xs text-muted mt-0.5">
                        {CATEGORY_LABELS[b.category]} · {tier.label} · +{b.xp_reward} XP
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {selected && (
            <div>
              <label htmlFor="badge-note" className="block text-xs font-semibold text-ink mb-1">
                Note <span className="font-normal text-muted">(optional — the member reads this)</span>
              </label>
              <textarea
                id="badge-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={280}
                placeholder="Clean triangle from guard. Well earned."
                className="w-full px-3 py-2 border border-line rounded text-sm focus:outline-none focus:border-black"
              />
            </div>
          )}

          <button
            type="button"
            onClick={handleAward}
            disabled={!selected || saving}
            className="w-full py-2.5 bg-black text-white rounded font-semibold text-sm hover:bg-near-black transition-colors disabled:opacity-40"
          >
            {saving ? "Awarding…" : selected ? `Award ${selected.name}` : "Pick a badge"}
          </button>
        </div>
      </Modal>

      {/* ConfirmModal has no `open` prop — the caller conditionally renders it. */}
      {revoking && (
        <ConfirmModal
          title="Remove this badge?"
          body={
            <>
              <strong className="text-ink">{revoking.badge.name}</strong> will be removed and its{" "}
              {revoking.badge.xp_reward} XP taken back.
            </>
          }
          confirmLabel="Remove"
          confirmBusyLabel="Removing…"
          tone="danger"
          onConfirm={handleRevoke}
          onCancel={() => setRevoking(null)}
        />
      )}
    </section>
  );
}

// Shared lifecycle-status + date-range formatting for tournament cards.
// Used by every place a tournament is shown as a card/row (ActiveTournament.tsx,
// ground/Tournament.tsx, dashboard/TournamentDetails.tsx,
// tournament/UpcomingMatches.tsx's header) so "ended" (and Live/Upcoming)
// render identically everywhere instead of each file growing its own
// slightly-different copy.

export type TournamentLifecycleStatus = 'LIVE' | 'UPCOMING' | 'COMPLETED';

export function getTournamentLifecycleStatus(startDate?: string | null, endDate?: string | null): TournamentLifecycleStatus {
  const now = new Date();
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  if (start && end && now >= start && now <= end) return 'LIVE';
  if (start && now < start) return 'UPCOMING';
  return 'COMPLETED';
}

// Tailwind classes for the badge's background+text, keyed by status.
export const TOURNAMENT_STATUS_BADGE: Record<TournamentLifecycleStatus, string> = {
  LIVE: 'bg-red-500 text-white',
  UPCOMING: 'bg-emerald-600 text-white',
  // Previously the same emerald as UPCOMING (a bug — the two were visually
  // indistinguishable); now its own distinct color everywhere.
  COMPLETED: 'bg-slate-500 text-white',
};

const formatOneDate = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// "12 Oct 2026 - 20 Oct 2026"
export function formatTournamentDateRange(startDate?: string | null, endDate?: string | null): string {
  return `${formatOneDate(startDate)} - ${formatOneDate(endDate)}`;
}

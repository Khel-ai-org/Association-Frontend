// The backend stores an appeal's decision as one of three values:
//   "Umpire's Call" | "Retained" | "Overturned"   (or null while undecided)
// The UI shows "Overturned" as "Lost". Always keep sending/comparing the raw
// backend value — only pass it through this helper for display.
export function decisionLabel(value?: string | null): string {
  return value === 'Overturned' ? 'Lost' : value || '';
}

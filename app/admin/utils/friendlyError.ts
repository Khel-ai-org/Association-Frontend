/**
 * Turns raw backend / network errors into messages an admin can act on.
 * Unknown messages pass through unchanged (just tidied), so useful server text isn't lost.
 */
export function friendlyError(raw: unknown, fallback = 'Something went wrong. Please try again.', status?: number): string {
  const text = (typeof raw === 'string' ? raw : raw instanceof Error ? raw.message : '').trim();

  if (!text) {
    if (status === 404) return "We couldn't find this item. It may have already been removed — please refresh the page.";
    if (status === 401 || status === 403) return "You don't have permission to do this. Please sign in again or contact an admin.";
    if (status && status >= 500) return 'The server ran into a problem. Please try again in a moment.';
    return fallback;
  }

  // Cannot edit team "X": fixtures have already been generated for tournament "Y" (status: fixtures_created)
  const locked = text.match(/cannot\s+(edit|update|delete|remove)\s+team\s+"([^"]+)":\s*fixtures have already been generated(?:\s+for tournament\s+"([^"]+)")?/i);
  if (locked) {
    const [, action, team, tournament] = locked;
    const verb = /delete|remove/i.test(action) ? 'deleted' : 'edited';
    return `${team} can't be ${verb} because fixtures have already been generated${tournament ? ` for ${tournament}` : ''}.`;
  }

  // "role must be one of: A, B, C"
  const oneOf = text.match(/(\w[\w\s]*?) must be one of:?\s*(.+)$/i);
  if (oneOf) {
    const field = oneOf[1].replace(/^validation error:\s*/i, '').trim().toLowerCase();
    return `Please choose a valid ${field}. Allowed options: ${oneOf[2].replace(/\.$/, '')}.`;
  }

  // Database enum rejected a value
  const enumMatch = text.match(/invalid input value for enum\s+(\w+):\s*"([^"]+)"/i);
  if (enumMatch) return `"${enumMatch[2]}" isn't an accepted value. Please review your selections and try again.`;

  if (/foreign key|still referenced|has (existing )?(matches|fixtures)|in use|cannot delete/i.test(text)) {
    return "This can't be changed because it is already used by matches or fixtures.";
  }
  if (/duplicate key|already exists|unique constraint/i.test(text)) {
    return 'This name already exists. Please choose a different one.';
  }
  if (/not found|no such/i.test(text) && !/validation/i.test(text)) {
    return "We couldn't find this item. It may have already been removed — please refresh the page.";
  }
  if (/violates|constraint|syntax error|null value in column|relation .* does not exist|\bsql\b|ECONN|ETIMEDOUT|internal server error/i.test(text)) {
    return "We couldn't complete this because of a server problem. Please try again in a moment.";
  }
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(text)) {
    return "Couldn't reach the server. Please check your internet connection and try again.";
  }

  const cleaned = text.replace(/^validation error:\s*/i, '').trim();
  const sentence = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

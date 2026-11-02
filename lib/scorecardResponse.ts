// `GET /matches/:id/scorecard` used to return an array — element 0 the main match, any further elements
// sequential super-overs. It now comes back as an object keyed by index
// ({ "0": {...}, "1": {...}, "pitch_no": null, "dimension": null }). Both shapes become the same array here.
export const toScorecardArray = (json: unknown): any[] => {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    const indexed = Object.keys(obj)
      .filter((k) => /^\d+$/.test(k) && obj[k] && typeof obj[k] === 'object')
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => obj[k]);
    if (indexed.length > 0) return indexed;
    // A single scorecard sent without the index wrapper.
    if ('innings_1' in obj) return [obj];
  }
  return [];
};

// Match-level fields that sit beside the indexed scorecards in the object shape (pitch number, ground dimension).
export const scorecardExtras = (json: unknown): { pitch_no?: unknown; dimension?: unknown } => {
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const obj = json as Record<string, unknown>;
    return { pitch_no: obj.pitch_no, dimension: obj.dimension };
  }
  const first: any = Array.isArray(json) ? json[0] : null;
  return { pitch_no: first?.pitch_no, dimension: first?.dimension };
};

const bands = {
  liked: { floor: 2, ceiling: 3, topScore: 10 },
  fine: { floor: 1, ceiling: 2, topScore: 6.7 },
  disliked: { floor: 0, ceiling: 1, topScore: 3.4 },
};
export const moods = Object.keys(bands);

function similarity(a, b) {
  const cuisine = a.cuisine && a.cuisine === b.cuisine ? 1 : 0;
  const city = a.city && a.city === b.city ? 1 : 0;
  const priceDistance = a.price && b.price ? Math.abs(a.price - b.price) : 1;
  const sharedTags = (a.tags ?? []).filter(tag => (b.tags ?? []).includes(tag)).length;
  // shortcut: the demo has one cuisine and one tag type, add additional fields if the catalog gains them.
  return cuisine + city - priceDistance + 1.5 * sharedTags;
}

export function beginRanking(ranked, entry) {
  const band = bands[entry.mood];
  if (!Object.hasOwn(bands, entry.mood)) throw new RangeError('Choose a rating first');
  const others = ranked.filter(item => item.id !== entry.id);
  const candidates = others.filter(item => item.mood === entry.mood)
    .sort((a, b) => b.value - a.value)
    .map(item => ({ item, weight: similarity(entry, item) }));
  return { entry, others, cursor: { candidates, low: band.floor, high: band.ceiling }, history: [] };
}

export function opponent({ cursor: { candidates, towardTop } }) {
  if (!candidates.length) return null;
  const bestWeight = Math.max(...candidates.map(candidate => candidate.weight));
  const best = candidates.filter(candidate => candidate.weight === bestWeight);
  const middle = (best.length - 1) / 2;
  return best[towardTop ? Math.ceil(middle) : Math.floor(middle)].item;
}

export function compare(draft, choice) {
  const { cursor, history } = draft;
  if (choice === 'undo') {
    return history.length ? { ...draft, cursor: history.at(-1), history: history.slice(0, -1) } : draft;
  }
  const current = opponent(draft);
  if (!current) return draft;
  const next = { ...cursor };
  if (choice === 'skip') {
    const demotedWeight = Math.min(...cursor.candidates.map(candidate => candidate.weight)) - 1;
    next.candidates = cursor.candidates.map(candidate =>
      candidate.item === current ? { ...candidate, weight: demotedWeight } : candidate);
  } else if (choice === 'tie') {
    // shortcut: ties use equal values; the no-ties feature flag is outside this one-category demo.
    next.low = next.high = current.value;
    next.candidates = [];
  } else if (choice === 'new' || choice === 'existing') {
    next.towardTop = choice === 'new';
    if (next.towardTop) next.low = current.value;
    else next.high = current.value;
    next.candidates = cursor.candidates.filter(({ item }) => item.value > next.low && item.value < next.high);
  } else {
    throw new RangeError('Unknown comparison choice');
  }
  return { ...draft, cursor: next, history: [...history, cursor] };
}

export function finishRanking({ entry, others, cursor: { candidates, low, high } }) {
  if (candidates.length) return null;
  return [...others, { ...entry, value: (low + high) / 2 }].sort((a, b) => b.value - a.value);
}

export function progress(ranked) {
  const target = 1;
  const count = new Set(ranked.map(entry => entry.id)).size;
  return { count, target, unlocked: count >= target };
}

export function score(id, ranked) {
  const entry = ranked.find(item => item.id === id);
  if (!entry || ranked.length < 10) return null;
  const peers = ranked.filter(item => item.mood === entry.mood);
  const ahead = peers.findIndex(item => item.value === entry.value);
  return (bands[entry.mood].topScore - 3.3 * ahead / peers.length).toFixed(1);
}

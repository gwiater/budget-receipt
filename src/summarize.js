export function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Sumuje wartości pozycji per kategoria, sortując od największej kwoty.
 */
export function summarizeByCategory(items) {
  const totals = new Map();

  for (const item of items) {
    const category = item.category || 'Inne';
    const price = Number(item.totalPrice) || 0;
    totals.set(category, (totals.get(category) || 0) + price);
  }

  return [...totals.entries()]
    .map(([category, total]) => ({ category, total: round2(total) }))
    .sort((a, b) => b.total - a.total);
}

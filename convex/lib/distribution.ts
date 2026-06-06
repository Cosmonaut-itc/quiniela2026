// convex/lib/distribution.ts
export function computeSlotSizes(n: number, total = 48): number[] {
  const base = Math.floor(total / n);
  const rem = total % n;
  const sizes = Array.from({ length: n }, (_, i) => (i < rem ? base + 1 : base));
  return sizes;
}

export function shuffleInPlace<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function drawN<T>(pool: T[], n: number, rand: () => number): { picked: T[]; rest: T[] } {
  const copy = [...pool];
  shuffleInPlace(copy, rand);
  return { picked: copy.slice(0, n), rest: copy.slice(n) };
}

export function balancedRedistribute(
  leftoverTeamIds: string[],
  participantCounts: { participantId: string; count: number }[],
  rand: () => number,
): { teamId: string; participantId: string }[] {
  const counts = participantCounts.map((p) => ({ ...p }));
  const teams = [...leftoverTeamIds];
  shuffleInPlace(teams, rand);
  const out: { teamId: string; participantId: string }[] = [];
  for (const teamId of teams) {
    counts.sort((a, b) => a.count - b.count);
    const target = counts[0];
    out.push({ teamId, participantId: target.participantId });
    target.count += 1;
  }
  return out;
}

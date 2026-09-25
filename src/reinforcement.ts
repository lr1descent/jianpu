import { DEGREES } from './music';
import { shuffle, type Random } from './quiz';
import type { ConfusionPair, Degree, ReinforcementSource, SessionRecord } from './types';

export function targetQuotas(pairs: readonly ConfusionPair[]): Map<Degree, number> {
  if (!pairs.length) throw new Error('请至少选择一组');
  const weights = new Map<Degree, number>();
  for (const pair of pairs) for (const d of [pair.a, pair.b]) weights.set(d, (weights.get(d) ?? 0) + pair.total);
  const weightSum = [...weights.values()].reduce((a, b) => a + b, 0);
  const remaining = 14 - weights.size;
  const rows = [...weights].map(([degree, weight]) => {
    const share = remaining * weight / weightSum;
    return { degree, count: 1 + Math.floor(share), remainder: share - Math.floor(share) };
  });
  let rest = 14 - rows.reduce((total, row) => total + row.count, 0);
  rows.sort((a, b) => b.remainder - a.remainder || a.degree - b.degree);
  for (const row of rows) if (rest-- > 0) row.count++;
  return new Map(rows.sort((a, b) => a.degree - b.degree).map(row => [row.degree, row.count]));
}
export function reinforcementSequence(pairs: readonly ConfusionPair[], random: Random = Math.random): Degree[] {
  const quotas = targetQuotas(pairs);
  const counts = new Map(DEGREES.map(d => [d, 1 + (quotas.get(d) ?? 0)]));
  const pool = DEGREES.flatMap(d => Array<Degree>(counts.get(d)!).fill(d));
  for (let attempt = 0; attempt < 32; attempt++) {
    const candidate = shuffle(pool, random);
    if (candidate.every((degree, index) => degree !== candidate[index - 1])) return candidate;
  }
  const result: Degree[] = [];
  // Finite fallback: choose the largest remaining count excluding the previous degree.
  // These quotas put at most 8 of 21 questions on one degree, so a valid arrangement exists.
  for (let i = 0; i < 21; i++) {
    const candidates = shuffle(DEGREES.filter(d => counts.get(d)! > 0 && d !== result.at(-1)), random)
      .sort((a, b) => counts.get(b)! - counts.get(a)!);
    const next = candidates[0];
    if (!next) throw new Error('强化配额无法排列');
    result.push(next);
    counts.set(next, counts.get(next)! - 1);
  }
  return result;
}
export function sourceSnapshot(exam: SessionRecord, pairs: readonly ConfusionPair[]): ReinforcementSource {
  if (exam.module !== 'notation' || exam.mode !== 'exam' || !exam.answers || !pairs.length) throw new Error('该记录不能作为简谱强化来源');
  return { examId: exam.id, examKey: exam.key, examEndedAt: exam.endedAt,
    examPlannedQuestions: exam.plannedQuestions, examAnswered: exam.summary.answered,
    examCorrect: exam.summary.correct, examEndedEarly: exam.endedEarly,
    selectedPairs: pairs.map(p => ({ ...p })), targetDegrees: [...new Set(pairs.flatMap(p => [p.a, p.b]))].sort() };
}

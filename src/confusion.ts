import { DEGREES, SOLFEGE } from './music';
import type { AnswerRecord, ConfusionPair } from './types';
export function confusionMatrix(answers: readonly AnswerRecord[]): number[][] {
  const matrix = DEGREES.map(() => DEGREES.map(() => 0));
  // Both axes are zero-based; selected is a label, never a screen position.
  for (const answer of answers) matrix[answer.degree - 1][SOLFEGE.indexOf(answer.selected)]++;
  return matrix;
}
export function confusionPairs(answers: readonly AnswerRecord[]): ConfusionPair[] {
  const matrix = confusionMatrix(answers);
  const pairs: ConfusionPair[] = [];
  for (const a of DEGREES) for (const b of DEGREES) {
    if (a >= b) continue;
    const aToB = matrix[a - 1][b - 1], bToA = matrix[b - 1][a - 1];
    if (aToB + bToA) pairs.push({ a, b, aToB, bToA, total: aToB + bToA });
  }
  return pairs.sort((a, b) => b.total - a.total || a.a - b.a || a.b - b.b);
}

import { DEGREES } from './music';
import { PITCH_CLASSES } from './keyboard';
import type { AnswerRecord, FirstAnswer, KeyboardAnswer, KeyboardSummary, PerDegreeStats, Summary } from './types';
export function summarize(answers: readonly AnswerRecord[]): Summary {
  const { perTarget, ...totals } = summarizeBy(answers, DEGREES, a => a.degree);
  return { ...totals, perDegree: perTarget };
}
export function summarizeKeyboard(answers: readonly KeyboardAnswer[]): KeyboardSummary {
  const { perTarget, ...totals } = summarizeBy(answers, PITCH_CLASSES, a => a.pitchClass);
  return { ...totals, perPitch: perTarget };
}
function summarizeBy<K extends number, A extends FirstAnswer<unknown>>(answers: readonly A[], targets: readonly K[], target: (answer: A) => K) {
  const perTarget = Object.fromEntries(targets.map(d => [d, { answered: 0, correct: 0, wrong: 0 }])) as Record<K, PerDegreeStats>;
  for (const answer of answers) {
    perTarget[target(answer)].answered++;
    perTarget[target(answer)][answer.correct ? 'correct' : 'wrong']++;
  }
  const correct = answers.filter(a => a.correct).length;
  const times = answers.filter(a => a.correct && !a.interruptedBeforeAnswer && a.reactionMs !== null)
    .map(a => a.reactionMs!).sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  const median = !times.length ? null : times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
  return { answered: answers.length, correct, wrong: answers.length - correct, medianCorrectReactionMs: median, perTarget };
}
export function accuracy(correct: number, answered: number): string {
  return answered ? `${Number((correct / answered * 100).toFixed(1))}%` : '—';
}

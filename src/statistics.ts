import { DEGREES } from './music';
import type { AnswerRecord, Degree, PerDegreeStats, Summary } from './types';
export function summarize(answers: readonly AnswerRecord[]): Summary {
  const perDegree = Object.fromEntries(DEGREES.map(d => [d, { answered: 0, correct: 0, wrong: 0 }])) as Record<Degree, PerDegreeStats>;
  for (const answer of answers) {
    perDegree[answer.degree].answered++;
    perDegree[answer.degree][answer.correct ? 'correct' : 'wrong']++;
  }
  const correct = answers.filter(a => a.correct).length;
  const times = answers.filter(a => a.correct && !a.interruptedBeforeAnswer && a.reactionMs !== null)
    .map(a => a.reactionMs!).sort((a, b) => a - b);
  const mid = Math.floor(times.length / 2);
  const median = !times.length ? null : times.length % 2 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
  return { answered: answers.length, correct, wrong: answers.length - correct, medianCorrectReactionMs: median, perDegree };
}
export function accuracy(correct: number, answered: number): string {
  return answered ? `${Number((correct / answered * 100).toFixed(1))}%` : '—';
}

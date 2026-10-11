import { DEGREES, SOLFEGE, pitch, solfege } from './music';
import type { Degree, KeyId, Question, QuestionCount } from './types';
export type Random = () => number;
export function shuffle<T>(items: readonly T[], random: Random = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function balancedSequence(count: QuestionCount, random: Random = Math.random): Degree[] {
  return balancedBag(DEGREES, count, random);
}
export function balancedBag<T>(items: readonly T[], count: number, random: Random = Math.random): T[] {
  if (items.length < 2 || !Number.isInteger(count) || count <= 0 || count % items.length !== 0) throw new Error('题数必须是音符数量的正整数倍');
  const sequence: T[] = [];
  while (sequence.length < count) {
    const bag = shuffle(items, random);
    if (bag[0] === sequence.at(-1)) [bag[0], bag[1]] = [bag[1], bag[0]];
    sequence.push(...bag);
  }
  return sequence;
}
export function makeQuestions(id: string, key: KeyId, degrees: Degree[], random: Random = Math.random): Question[] {
  return degrees.map((degree, index) => ({ id: `${id}:${index}`, index, key, degree,
    ...pitch(key, degree), correctAnswer: solfege(degree), options: shuffle(SOLFEGE, random) }));
}

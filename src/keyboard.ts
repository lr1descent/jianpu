import { balancedBag, shuffle, type Random } from './quiz';
import type { KeyboardDirection, KeyboardQuestion, KeyboardQuestionCount, KeyboardSettings, PitchClass } from './types';

// Both directions and all enharmonic spellings resolve to this one chromatic map.
export const KEYBOARD_NOTES: readonly { pitchClass: PitchClass; names: readonly string[]; whitePosition: number | null; blackPosition: number | null }[] = [
  { pitchClass: 0, names: ['C'], whitePosition: 0, blackPosition: null },
  { pitchClass: 1, names: ['C♯', 'D♭'], whitePosition: null, blackPosition: 1 },
  { pitchClass: 2, names: ['D'], whitePosition: 1, blackPosition: null },
  { pitchClass: 3, names: ['D♯', 'E♭'], whitePosition: null, blackPosition: 2 },
  { pitchClass: 4, names: ['E'], whitePosition: 2, blackPosition: null },
  { pitchClass: 5, names: ['F'], whitePosition: 3, blackPosition: null },
  { pitchClass: 6, names: ['F♯', 'G♭'], whitePosition: null, blackPosition: 4 },
  { pitchClass: 7, names: ['G'], whitePosition: 4, blackPosition: null },
  { pitchClass: 8, names: ['G♯', 'A♭'], whitePosition: null, blackPosition: 5 },
  { pitchClass: 9, names: ['A'], whitePosition: 5, blackPosition: null },
  { pitchClass: 10, names: ['A♯', 'B♭'], whitePosition: null, blackPosition: 6 },
  { pitchClass: 11, names: ['B'], whitePosition: 6, blackPosition: null },
];
export const PITCH_CLASSES = KEYBOARD_NOTES.map(n => n.pitchClass);
export const KEYBOARD_COUNTS = [12, 24, 36] as const;
export const DEFAULT_KEYBOARD_SETTINGS: KeyboardSettings = { direction: 'name-to-key', questionCount: 24 };
export const keyboardDirectionName = (direction: KeyboardDirection) => direction === 'name-to-key' ? '音名 → 琴键' : '琴键 → 音名';
export function keyboardNote(pitchClass: PitchClass) {
  const note = KEYBOARD_NOTES.find(n => n.pitchClass === pitchClass);
  if (!note) throw new Error('琴键必须是 C–B 的十二个半音之一');
  return note;
}
export const keyboardNoteName = (pitchClass: PitchClass) => keyboardNote(pitchClass).names.join(' / ');
const KEYBOARD_BASE_MIDI = 60; // C4; enharmonic names share the same pitch class.
export const keyboardMidi = (pitchClass: PitchClass) => KEYBOARD_BASE_MIDI + keyboardNote(pitchClass).pitchClass;
export function keyboardKeyPosition(pitchClass: PitchClass) {
  const note = keyboardNote(pitchClass);
  const sameColor = KEYBOARD_NOTES.filter(n => (n.whitePosition === null) === (note.whitePosition === null));
  return `从左第 ${sameColor.findIndex(n => n.pitchClass === pitchClass) + 1} 个${note.whitePosition === null ? '黑' : '白'}键`;
}
export function makeKeyboardQuestions(id: string, count: KeyboardQuestionCount, random: Random = Math.random): KeyboardQuestion[] {
  if (!KEYBOARD_COUNTS.includes(count)) throw new Error('键盘练习题数必须为 12、24 或 36');
  const spellings = new Map<PitchClass, number>();
  return balancedBag(PITCH_CLASSES, count, random).map((pitchClass, index) => {
    const names = keyboardNote(pitchClass).names;
    const spelling = spellings.get(pitchClass) ?? Math.floor(random() * names.length);
    spellings.set(pitchClass, spelling + 1);
    return { id: `${id}:${index}`, index, pitchClass, promptName: names[spelling % names.length],
      correctAnswer: pitchClass, options: shuffle(PITCH_CLASSES, random) };
  });
}

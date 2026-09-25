import type { Degree, KeyId, Solfege } from './types';

export const DEGREES: Degree[] = [1, 2, 3, 4, 5, 6, 7];
export const SOLFEGE: Solfege[] = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'];
export const MAJOR_OFFSETS = [0, 2, 4, 5, 7, 9, 11] as const;
export const KEYS: { id: KeyId; label: string; tonicMidi: number; notes: string[] }[] = [
  { id: 'C', label: 'C', tonicMidi: 60, notes: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'] },
  { id: 'Db', label: 'D♭', tonicMidi: 61, notes: ['D♭4', 'E♭4', 'F4', 'G♭4', 'A♭4', 'B♭4', 'C5'] },
  { id: 'D', label: 'D', tonicMidi: 62, notes: ['D4', 'E4', 'F♯4', 'G4', 'A4', 'B4', 'C♯5'] },
  { id: 'Eb', label: 'E♭', tonicMidi: 63, notes: ['E♭4', 'F4', 'G4', 'A♭4', 'B♭4', 'C5', 'D5'] },
  { id: 'E', label: 'E', tonicMidi: 64, notes: ['E4', 'F♯4', 'G♯4', 'A4', 'B4', 'C♯5', 'D♯5'] },
  { id: 'F', label: 'F', tonicMidi: 65, notes: ['F4', 'G4', 'A4', 'B♭4', 'C5', 'D5', 'E5'] },
  { id: 'F#', label: 'F♯', tonicMidi: 66, notes: ['F♯4', 'G♯4', 'A♯4', 'B4', 'C♯5', 'D♯5', 'E♯5'] },
  { id: 'G', label: 'G', tonicMidi: 67, notes: ['G4', 'A4', 'B4', 'C5', 'D5', 'E5', 'F♯5'] },
  { id: 'Ab', label: 'A♭', tonicMidi: 68, notes: ['A♭4', 'B♭4', 'C5', 'D♭5', 'E♭5', 'F5', 'G5'] },
  { id: 'A', label: 'A', tonicMidi: 69, notes: ['A4', 'B4', 'C♯5', 'D5', 'E5', 'F♯5', 'G♯5'] },
  { id: 'Bb', label: 'B♭', tonicMidi: 70, notes: ['B♭4', 'C5', 'D5', 'E♭5', 'F5', 'G5', 'A5'] },
  { id: 'B', label: 'B', tonicMidi: 71, notes: ['B4', 'C♯5', 'D♯5', 'E5', 'F♯5', 'G♯5', 'A♯5'] },
];
export function keyInfo(key: KeyId) {
  const result = KEYS.find(item => item.id === key);
  if (!result) throw new Error('未知调性');
  return result;
}
export function solfege(degree: Degree): Solfege {
  if (!DEGREES.includes(degree)) throw new Error('数字必须为 1—7');
  return SOLFEGE[degree - 1];
}
export function pitch(key: KeyId, degree: Degree) {
  solfege(degree);
  const info = keyInfo(key);
  return { midi: info.tonicMidi + MAJOR_OFFSETS[degree - 1], displayNote: info.notes[degree - 1] };
}
export function midiToHz(midi: number) { return 440 * 2 ** ((midi - 69) / 12); }

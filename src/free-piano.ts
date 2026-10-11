import { keyboardNote } from './keyboard';
import type { PitchClass } from './types';

export const PIANO_LOWEST_MIDI = 21;
export const PIANO_HIGHEST_MIDI = 108;
export const PIANO_DEFAULT_MIDI = 60;
export function pianoNote(midi: number) {
  if (!Number.isInteger(midi) || midi < PIANO_LOWEST_MIDI || midi > PIANO_HIGHEST_MIDI) throw new Error('琴键音高必须在 A0–C8 范围内');
  const note = keyboardNote(midi % 12 as PitchClass);
  const octave = Math.floor(midi / 12) - 1;
  return { midi, names: note.names.map(name => `${name}${octave}`), black: note.whitePosition === null };
}
export const PIANO_KEYS = (() => {
  let whites = 0;
  return Array.from({ length: PIANO_HIGHEST_MIDI - PIANO_LOWEST_MIDI + 1 }, (_, index) => {
    const note = pianoNote(PIANO_LOWEST_MIDI + index);
    const position = whites;
    if (!note.black) whites++;
    return { ...note, position };
  });
})();
export const PIANO_WHITE_KEYS = PIANO_KEYS.filter(key => !key.black);

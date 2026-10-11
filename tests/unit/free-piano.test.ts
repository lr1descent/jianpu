import { expect, it } from 'vitest';
import { PIANO_KEYS, PIANO_WHITE_KEYS, pianoNote } from '../../src/free-piano';

it('88 键 A0–C8 连续覆盖 MIDI，52 白键、36 黑键，八度音名正确', () => {
  expect(PIANO_KEYS).toHaveLength(88);
  expect(PIANO_WHITE_KEYS).toHaveLength(52);
  expect(PIANO_KEYS.filter(key => key.black)).toHaveLength(36);
  expect(PIANO_KEYS.map(key => key.midi)).toEqual(Array.from({ length: 88 }, (_, index) => index + 21));
  expect(PIANO_KEYS[0].names).toEqual(['A0']);
  expect(PIANO_KEYS.at(-1)!.names).toEqual(['C8']);
  expect(pianoNote(48).names).toEqual(['C3']);
  expect(pianoNote(60).names).toEqual(['C4']);
  expect(pianoNote(61).names).toEqual(['C♯4', 'D♭4']);
  expect(pianoNote(59).names).toEqual(['B3']);
  expect(pianoNote(72).names).toEqual(['C5']);
  for (const midi of [20, 109, NaN, 60.5]) expect(() => pianoNote(midi)).toThrow('A0–C8');
});
it('黑键位于相邻白键边界，每个完整八度保持两加三排列', () => {
  expect(PIANO_WHITE_KEYS.map(key => key.position)).toEqual(Array.from({ length: 52 }, (_, index) => index));
  for (const key of PIANO_KEYS.filter(key => key.black)) {
    const left = PIANO_WHITE_KEYS[key.position - 1], right = PIANO_WHITE_KEYS[key.position];
    expect(left.midi + 1).toBe(key.midi);
    expect(right.midi - 1).toBe(key.midi);
  }
  for (let octave = 1; octave < 8; octave++) {
    const base = PIANO_KEYS.find(key => key.midi === (octave + 1) * 12)!;
    const black = PIANO_KEYS.filter(key => key.black && key.midi >= base.midi && key.midi < base.midi + 12);
    expect(black.map(key => key.position - base.position)).toEqual([1, 2, 4, 5, 6]);
  }
});

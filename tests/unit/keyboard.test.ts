import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYBOARD_SETTINGS, KEYBOARD_NOTES, PITCH_CLASSES, keyboardKeyPosition, keyboardMidi, keyboardNoteName, makeKeyboardQuestions } from '../../src/keyboard';
import { KeyboardSession } from '../../src/keyboard-session';
import { Session } from '../../src/session';
import { BACKUP_V3_KEY, DEFAULT_SETTINGS, LocalStore, STORAGE_KEY, validKeyboardSession } from '../../src/storage';
import { confusionPairs } from '../../src/confusion';
import { sourceSnapshot } from '../../src/reinforcement';
import { pianoKeyboardView } from '../../src/keyboard-views';
import type { KeyboardDirection, KeyboardSessionRecord, PitchClass } from '../../src/types';

const sessionFor = (direction: KeyboardDirection = 'name-to-key', now = () => 0) =>
  new KeyboardSession({ module: 'keyboard', mode: 'practice', direction, count: 12 }, now, () => 0);
class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
function reportFor(direction: KeyboardDirection = 'name-to-key') {
  const session = sessionFor(direction);
  session.ready();
  if (direction === 'key-to-name') { session.beginPlayback(); session.completePlayback(); }
  session.submit(session.question.pitchClass);
  return session.finish();
}

describe('十二音键盘与出题', () => {
  it('白键 C–B，黑键两加三排列；等音名使用同一音位', () => {
    expect(KEYBOARD_NOTES.filter(n => n.whitePosition !== null).map(n => n.names[0])).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(KEYBOARD_NOTES.filter(n => n.blackPosition !== null).map(n => n.blackPosition)).toEqual([1, 2, 4, 5, 6]);
    expect(keyboardNoteName(6)).toBe('F♯ / G♭');
    expect(keyboardNoteName(10)).toBe('A♯ / B♭');
    expect(keyboardKeyPosition(6)).toBe('从左第 3 个黑键');
    expect(() => keyboardNoteName(12 as PitchClass)).toThrow();
    expect(PITCH_CLASSES.map(keyboardMidi)).toEqual([60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71]);
    expect(() => keyboardMidi(12 as PitchClass)).toThrow();
  });
  it.each([12, 24, 36] as const)('%i 题均衡覆盖、不连续重复，每题有十二个唯一选项', count => {
    const questions = makeKeyboardQuestions('round', count);
    for (let i = 0; i < count; i += 12) expect(new Set(questions.slice(i, i + 12).map(q => q.pitchClass)).size).toBe(12);
    for (const pitch of PITCH_CLASSES) expect(questions.filter(q => q.pitchClass === pitch)).toHaveLength(count / 12);
    questions.forEach((q, i) => {
      expect(q.options.slice().sort((a, b) => a - b)).toEqual(PITCH_CLASSES);
      if (i) expect(q.pitchClass).not.toBe(questions[i - 1].pitchClass);
    });
    for (const note of KEYBOARD_NOTES.filter(n => n.names.length === 2)) {
      const occurrences = questions.filter(q => q.pitchClass === note.pitchClass);
      if (count >= 24) expect(new Set(occurrences.slice(0, 2).map(q => q.promptName))).toEqual(new Set(note.names));
    }
  });
  it('琴键按钮作答前没有音名提示，反向目标可通过位置描述识别', () => {
    const session = sessionFor(); session.ready();
    expect(pianoKeyboardView(session)).not.toContain('key-name');
    expect(pianoKeyboardView(session)).toContain('aria-label="从左第 1 个黑键"');
    const reverse = sessionFor('key-to-name'); reverse.ready();
    expect(pianoKeyboardView(reverse)).toContain('标记的是从左第 1 个黑键');
    expect(pianoKeyboardView(reverse)).not.toContain('<button');
  });
});

describe('键盘首次作答生命周期', () => {
  it.each(['name-to-key', 'key-to-name'] as const)('%s 按方向播放，只记录首次答案；十二题可完整结算', direction => {
    let clock = 1000;
    const session = sessionFor(direction, () => clock);
    expect(session.submit(1)).toBe(false);
    for (let i = 0; i < 12; i++) {
      expect(session.ready()).toBe(direction === 'name-to-key');
      expect(session.shouldPlay).toBe(direction === 'key-to-name');
      if (session.shouldPlay) {
        expect(session.beginPlayback()).toBe(true);
        expect(session.submit(session.question.pitchClass)).toBe(false);
        clock += 1300;
        expect(session.completePlayback()).toBe(true);
      }
      expect(session.replay()).toBe(false);
      clock += 400;
      expect(session.submit(session.question.pitchClass)).toBe(true);
      expect(session.submit(0)).toBe(false);
      expect(session.currentAnswer?.reactionMs).toBe(400);
      expect(session.shouldPlay).toBe(direction === 'name-to-key');
      if (session.shouldPlay) {
        expect(session.beginPlayback()).toBe(true);
        expect(session.next()).toBe(false);
        clock += 1300;
        expect(session.completePlayback()).toBe(true);
      }
      expect(session.next()).toBe(i < 11);
    }
    const result = session.finish();
    expect(result).toMatchObject({ direction, endedEarly: false, summary: { answered: 12, correct: 12, medianCorrectReactionMs: 400 } });
    expect(validKeyboardSession(result)).toBe(true);
    expect(result.answers.every(a => a.replaysBeforeAnswer === 0 && a.replaysAfterAnswer === 0)).toBe(true);
    result.answers[0].selected = 0;
    expect(session.finish().answers[0].selected).toBe(1);
  });
  it('琴键题声音中断保留原题、重播后计时无效；主动静音可继续并保存', () => {
    const session = sessionFor('key-to-name');
    session.beginPlayback(); session.suspend('播放失败');
    expect(session.completePlayback()).toBe(false);
    session.resume();
    expect(session.phase).toBe('loading');
    expect(session.beginPlayback()).toBe(true);
    session.completePlayback(); session.submit(session.question.pitchClass);
    expect(session.currentAnswer).toMatchObject({ interruptedBeforeAnswer: true, reactionMs: null });
    session.next();
    expect(session.ready(true)).toBe(true);
    expect(session.submit(session.question.pitchClass, true)).toBe(true);
    const record = session.finish();
    expect(record.answers[1].mutedAtAnswer).toBe(true);
    const memory = new MemoryStorage(); const store = new LocalStore(memory);
    store.save(record);
    expect(new LocalStore(memory).data.sessions[0]).toEqual(record);
  });
  it('未答暂停使耗时无效，已答暂停保留答案与耗时；零题和提前结束可保存', () => {
    let clock = 0;
    const session = sessionFor('name-to-key', () => clock);
    const original = structuredClone(session.question);
    session.ready(); session.suspend(); clock = 10000;
    expect(session.submit(1)).toBe(false);
    session.resume();
    expect(session.question).toEqual(original);
    session.submit(1);
    expect(session.currentAnswer).toMatchObject({ reactionMs: null, interruptedBeforeAnswer: true });
    session.next(); session.ready(); clock += 500; session.submit(session.question.pitchClass);
    const answer = structuredClone(session.currentAnswer);
    session.suspend(); clock += 20000; session.resume();
    expect(session.currentAnswer).toEqual(answer);
    expect(session.finish().summary.medianCorrectReactionMs).toBe(500);
    expect(validKeyboardSession(sessionFor().finish())).toBe(true);
  });
});

describe('schema v4 迁移与键盘记录', () => {
  it('v3 两模块设置、首次答案和强化来源原样保留，先备份再升级', () => {
    const exam = new Session({ module: 'notation', mode: 'exam', key: 'F#', count: 7, muted: false });
    exam.ready(); exam.submit(exam.question.options.find(o => o !== exam.question.correctAnswer)!);
    const originalExam = exam.finish();
    const source = sourceSnapshot(originalExam, confusionPairs(originalExam.answers!));
    const reinforcement = new Session({ module: 'notation', mode: 'reinforcement', key: 'F#', count: 21, muted: false, source }).finish();
    const relative = new Session({ module: 'relative', mode: 'practice', key: 'D', count: 7, muted: false });
    relative.beginPlayback(); relative.completePlayback(); relative.submit(relative.question.correctAnswer);
    const records = [originalExam, reinforcement, relative.finish()];
    const legacySettings = { volume: .6, muted: false, modules: {
      notation: { ...DEFAULT_SETTINGS.modules.notation, key: 'F#' }, relative: { ...DEFAULT_SETTINGS.modules.relative, key: 'D' },
    } };
    const raw = JSON.stringify({ schemaVersion: 3, settings: legacySettings, sessions: records });
    const memory = new MemoryStorage(); memory.setItem(STORAGE_KEY, raw);
    const store = new LocalStore(memory);
    expect(memory.getItem(BACKUP_V3_KEY)).toBe(raw);
    expect(store.data.schemaVersion).toBe(4);
    expect(store.data.settings).toEqual({ ...legacySettings, modules: { ...legacySettings.modules, keyboard: DEFAULT_KEYBOARD_SETTINGS } });
    for (const original of records) expect(store.data.sessions.find(r => r.id === original.id)).toEqual(original);
    store.save(reportFor());
    expect(new LocalStore(memory).data.sessions).toHaveLength(4);
    expect(memory.getItem(BACKUP_V3_KEY)).toBe(raw);
  });
  it('两个方向独立保存，摘要由首次答案校正，设置重载不丢失', () => {
    const memory = new MemoryStorage(); const store = new LocalStore(memory);
    for (const direction of ['name-to-key', 'key-to-name'] as const) {
      const record = reportFor(direction);
      record.summary = { ...record.summary, correct: 0, wrong: 1 };
      store.save(record); store.save(record);
    }
    store.updateSettings({ ...store.data.settings, modules: { ...store.data.settings.modules, keyboard: { direction: 'key-to-name', questionCount: 36 } } });
    const restored = new LocalStore(memory);
    expect(restored.data.sessions).toHaveLength(2);
    expect(restored.data.sessions.every(r => r.summary.correct === 1)).toBe(true);
    expect(restored.data.settings.modules.keyboard).toEqual({ direction: 'key-to-name', questionCount: 36 });
  });
  it('v3 备份失败或 v4 损坏保留原数据，不在其上写入新记录', () => {
    const memory = new MemoryStorage();
    const raw = JSON.stringify({ schemaVersion: 3, settings: DEFAULT_SETTINGS, sessions: [] });
    memory.setItem(STORAGE_KEY, raw);
    const blocked = new LocalStore({ getItem: memory.getItem.bind(memory), removeItem: memory.removeItem.bind(memory), setItem: () => { throw new Error('backup denied'); } });
    blocked.save(reportFor()); blocked.retry();
    expect(memory.getItem(STORAGE_KEY)).toBe(raw);
    expect(blocked.notice).toContain('原始数据未覆盖');
    const corrupt = JSON.stringify({ schemaVersion: 4, settings: DEFAULT_SETTINGS, sessions: [{ ...reportFor(), direction: 'unknown' }] });
    memory.setItem(STORAGE_KEY, corrupt);
    const store = new LocalStore(memory); store.save(reportFor()); store.updateSettings(DEFAULT_SETTINGS);
    expect(memory.getItem(STORAGE_KEY)).toBe(corrupt);
  });
  it('拒绝篡改音位、音名、正误、顺序及音频字段', () => {
    const original = reportFor();
    expect(validKeyboardSession({ ...original, direction: ['name-to-key'] })).toBe(false);
    expect(validKeyboardSession({ ...original, answers: [{ ...original.answers[0], promptName: ['C♯'] }] })).toBe(false);
    const mutations: ((r: KeyboardSessionRecord) => void)[] = [
      r => { r.answers[0].pitchClass = 12 as PitchClass; }, r => { r.answers[0].selected = 12 as PitchClass; },
      r => { r.answers[0].correct = false; }, r => { r.answers[0].promptName = 'F'; },
      r => { r.answers[0].questionIndex = 4; }, r => { r.answers[0].replaysAfterAnswer = 1; },
      r => { Object.assign(r.answers[0], { mutedAtAnswer: 'true' }); }, r => { r.endedEarly = false; },
    ];
    for (const mutate of mutations) { const record = reportFor(); mutate(record); expect(validKeyboardSession(record)).toBe(false); }
  });
});

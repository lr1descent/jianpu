import { describe, expect, it } from 'vitest';
import { DEGREES, KEYS, MAJOR_OFFSETS, SOLFEGE, midiToHz, pitch, solfege } from '../../src/music';
import { balancedSequence, makeQuestions } from '../../src/quiz';
import { Session } from '../../src/session';
import { confusionMatrix, confusionPairs } from '../../src/confusion';
import { reinforcementSequence, sourceSnapshot, targetQuotas } from '../../src/reinforcement';
import { accuracy, summarize } from '../../src/statistics';
import { BACKUP_KEY, DEFAULT_SETTINGS, LocalStore, STORAGE_KEY } from '../../src/storage';
import type { ConfusionPair, Degree, SessionRecord } from '../../src/types';

const seeded = (initial: number) => { let seed = initial; return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; }; };
const pair = (a: Degree, b: Degree, total = 1): ConfusionPair => ({ a, b, aToB: total, bToA: 0, total });
function sampleReport() {
  const session = new Session({ mode: 'exam', key: 'C', count: 35, muted: false }, () => 1000, seeded(9), 'example');
  const wrongs = new Map([[3, 2], [5, 1]]);
  for (let i = 0; i < 35; i++) {
    session.ready();
    const degree = session.question.degree;
    const left = wrongs.get(degree) ?? 0;
    session.submit(left > 0 ? degree === 3 ? 'fa' : 'la' : solfege(degree), false);
    if (left) wrongs.set(degree, left - 1);
    session.next();
  }
  return session.finish();
}
class MemoryStorage {
  values = new Map<string, string>();
  fail = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.fail) throw new Error('quota'); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe('首调音乐规则与洗牌袋', () => {
  it('十二调 84 个音保留唱名、八度及大调偏移', () => {
    for (const key of KEYS) for (const degree of DEGREES) {
      expect(pitch(key.id, degree).midi).toBe(key.tonicMidi + MAJOR_OFFSETS[degree - 1]);
      expect(solfege(degree)).toBe(SOLFEGE[degree - 1]);
    }
    expect(pitch('C', 5)).toEqual({ midi: 67, displayNote: 'G4' });
    expect([1, 3, 5, 7].map(d => pitch('D', d as Degree).midi)).toEqual([62, 66, 69, 73]);
    expect([1, 3, 7].map(d => pitch('E', d as Degree).midi)).toEqual([64, 68, 75]);
    expect(pitch('F#', 7)).toEqual({ midi: 77, displayNote: 'E♯5' });
    expect(midiToHz(69)).toBe(440);
    expect(() => solfege(0 as Degree)).toThrow();
  });
  it('所有题数跨袋无连续同号，每袋七音齐全，每题选项独立完整', () => {
    for (const count of [7, 21, 35] as const) for (let seed = 0; seed < 100; seed++) {
      const sequence = balancedSequence(count, seeded(seed));
      expect(sequence).toHaveLength(count);
      for (const degree of DEGREES) expect(sequence.filter(d => d === degree)).toHaveLength(count / 7);
      expect(sequence.every((d, i) => d !== sequence[i - 1])).toBe(true);
      const questions = makeQuestions('test', 'D', sequence, seeded(seed + 1));
      for (const q of questions) expect([...q.options].sort()).toEqual([...SOLFEGE].sort());
      expect(new Set(questions.map(q => q.options.join(','))).size).toBeGreaterThan(1);
    }
  });
});
describe('首次答案、暂停与计时', () => {
  it('连点只记录一次，考试保持中性阶段，重听前后计数不改耗时', () => {
    let time = 0;
    const s = new Session({ mode: 'exam', key: 'D', count: 7, muted: false }, () => time);
    expect(s.submit('fa', false)).toBe(false);
    time = 500; s.ready(); time = 800; s.replay(); time = 1300;
    const question = structuredClone(s.question);
    expect(s.submit('fa', false)).toBe(true);
    expect(s.submit('do', false)).toBe(false);
    expect(s.phase).toBe('examAnswerRecorded');
    time = 3000; s.replay();
    expect(s.question).toEqual(question);
    expect(s.answers[0]).toMatchObject({ selected: 'fa', reactionMs: 800, replaysBeforeAnswer: 1, replaysAfterAnswer: 1 });
    s.next(); expect(s.next()).toBe(false);
    expect(s.index).toBe(1);
  });
  it('中断未答题保留原题、耗时 null；已答题中断保留首次记录且不能重答', () => {
    const s = new Session({ mode: 'practice', key: 'C', count: 7, muted: false }, () => 250);
    s.ready(); const q = structuredClone(s.question); s.suspend();
    expect(s.submit('do', false)).toBe(false); s.resume();
    expect(s.question).toEqual(q); s.submit(q.correctAnswer, false);
    expect(s.answers[0]).toMatchObject({ reactionMs: null, interruptedBeforeAnswer: true });
    s.next(); s.ready(); s.submit(s.question.correctAnswer, false);
    const answer = structuredClone(s.currentAnswer); s.suspend('播放失败'); s.resume();
    expect(s.phase).toBe('practiceFeedback'); expect(s.currentAnswer).toEqual(answer);
    expect(s.submit('fa', true)).toBe(false);
  });
  it('零作答与部分完成按已答计分；结算冻结并去重', () => {
    const zero = new Session({ mode: 'exam', key: 'C', count: 35, muted: false });
    expect(zero.finish().summary).toMatchObject({ answered: 0, correct: 0, medianCorrectReactionMs: null });
    expect(accuracy(0, 0)).toBe('—');
    const s = new Session({ mode: 'exam', key: 'C', count: 35, muted: false });
    s.ready(); s.submit(s.question.correctAnswer, false); s.markMuted();
    const first = s.finish(); expect(first.endedEarly).toBe(true);
    expect(accuracy(first.summary.correct, first.summary.answered)).toBe('100%');
    first.answers![0].selected = 'fa'; expect(s.finish().answers![0].selected).toBe(s.question.correctAnswer);
    expect(s.finish().audioEverMuted).toBe(true);
  });
  it('速度只统计首次正确且未中断样本的中位数', () => {
    const data = sampleReport().answers!.slice(0, 5).map((a, i) => ({ ...a, correct: i < 4, reactionMs: [100, 300, 700, null, 5000][i], interruptedBeforeAnswer: i === 3 }));
    expect(summarize(data).medianCorrectReactionMs).toBe(300);
  });
});
describe('有方向的混淆及自选强化', () => {
  it('需求样本精确得到 32 对 3 错，不伪造反向错误', () => {
    const report = sampleReport();
    expect(report.summary).toMatchObject({ answered: 35, correct: 32, wrong: 3 });
    const matrix = confusionMatrix(report.answers!);
    expect(matrix[2][3]).toBe(2); expect(matrix[3][2]).toBe(0); expect(matrix[4][5]).toBe(1);
    expect(confusionPairs(report.answers!)).toEqual([pair(3, 4, 2), pair(5, 6)]);
    expect(confusionPairs([])).toEqual([]);
  });
  it('单组 3/4 各 8 次，其余各 1 次，无相邻同号', () => {
    for (let seed = 0; seed < 100; seed++) {
      const sequence = reinforcementSequence([pair(3, 4)], seeded(seed));
      expect(sequence).toHaveLength(21);
      DEGREES.forEach(d => expect(sequence.filter(v => v === d)).toHaveLength(d === 3 || d === 4 ? 8 : 1));
      expect(sequence.every((d, i) => d !== sequence[i - 1])).toBe(true);
    }
  });
  it('最大余数、共享端点和全部数字为目标的确定配额', () => {
    expect([...targetQuotas([pair(3, 4, 2), pair(5, 6)])]).toEqual([[3, 4], [4, 4], [5, 3], [6, 3]]);
    expect([...targetQuotas([pair(1, 2), pair(3, 4)])]).toEqual([[1, 4], [2, 4], [3, 3], [4, 3]]);
    expect([...targetQuotas([pair(1, 2), pair(2, 3)])]).toEqual([[1, 4], [2, 6], [3, 4]]);
    const all = [pair(1, 2), pair(2, 3), pair(3, 4), pair(4, 5), pair(5, 6), pair(6, 7)];
    for (let seed = 0; seed < 100; seed++) {
      const sequence = reinforcementSequence(all, seeded(seed));
      expect(new Set(sequence).size).toBe(7); expect(sequence).toHaveLength(21);
      expect(sequence.every((d, i) => d !== sequence[i - 1])).toBe(true);
    }
    expect(() => targetQuotas([])).toThrow('请至少选择一组');
  });
  it('来源快照独立，强化/重考不同 ID、不修改原考试且不追加题目', () => {
    const exam = sampleReport(); const before = structuredClone(exam);
    const pairs = confusionPairs(exam.answers!); const source = sourceSnapshot(exam, pairs);
    pairs[0].total = 99;
    const s = new Session({ mode: 'reinforcement', key: exam.key, count: 21, source, muted: false });
    source.selectedPairs[0].total = 100;
    for (let i = 0; i < 21; i++) { s.ready(); s.submit('do', false); s.next(); }
    const result = s.finish(); expect(result.plannedQuestions).toBe(21); expect(result.answers).toHaveLength(21);
    expect(result.reinforcementSource!.selectedPairs[0].total).toBe(2);
    expect(result.id).not.toBe(exam.id); expect(exam).toEqual(before);
  });
});
describe('schema v2、迁移与本地数据安全', () => {
  it('保存真实错选，读取还原报告，ID 去重，上限按结束时间保留 100', () => {
    const memory = new MemoryStorage(); const store = new LocalStore(memory); const report = sampleReport();
    store.save(report); store.save(report); expect(store.data.sessions).toHaveLength(1);
    expect(new LocalStore(memory).data.sessions[0]).toEqual(report);
    for (let i = 0; i < 110; i++) store.save({ ...report, id: `record-${i}`, endedAt: new Date(1800000000000 + i * 1000).toISOString() });
    expect(store.data.sessions).toHaveLength(100); expect(store.data.sessions[0].id).toBe('record-109');
  });
  it('v1 摘要保留、answers null、考试默认 35，先保存一份原始备份', () => {
    const memory = new MemoryStorage(); const exam = sampleReport();
    const original = JSON.stringify({ schemaVersion: 1, settings: { key: 'D', questionCount: 7, volume: 0.2, muted: true }, sessions: [exam] });
    memory.setItem(STORAGE_KEY, original); const store = new LocalStore(memory);
    expect(store.data.settings).toMatchObject({ key: 'D', practiceQuestionCount: 7, examQuestionCount: 35, muted: true });
    expect(store.data.sessions[0]).toMatchObject({ mode: 'practice', answers: null, legacySummaryOnly: true, summary: exam.summary });
    expect(memory.getItem(BACKUP_KEY)).toBe(original);
  });
  it.each(['{invalid', '{"schemaVersion":999}', '{"schemaVersion":2,"settings":{}}'])('未知/损坏原始数据不会覆盖：%s', raw => {
    const memory = new MemoryStorage(); memory.setItem(STORAGE_KEY, raw); const store = new LocalStore(memory);
    store.save(sampleReport()); store.updateSettings(DEFAULT_SETTINGS); expect(memory.getItem(STORAGE_KEY)).toBe(raw);
    expect(store.notice).toContain('原始数据未覆盖');
  });
  it('备份失败仍保留旧键；写入失败有提示；只清理应用历史', () => {
    const memory = new MemoryStorage(); memory.setItem('unrelated', 'keep');
    const raw = JSON.stringify({ schemaVersion: 1, settings: { ...DEFAULT_SETTINGS }, sessions: [sampleReport()] });
    memory.setItem(STORAGE_KEY, raw); memory.fail = true; const store = new LocalStore(memory);
    store.save(sampleReport()); expect(memory.getItem(STORAGE_KEY)).toBe(raw); expect(store.notice).toContain('内存');
    const writable = new MemoryStorage(); const live = new LocalStore(writable); writable.fail = true;
    live.save(sampleReport()); expect(live.notice).toContain('保存失败');
    memory.fail = false; const restored = new LocalStore(memory); restored.clearHistory();
    expect(memory.getItem('unrelated')).toBe('keep'); expect(restored.data.settings).toEqual(DEFAULT_SETTINGS);
  });
  it('不接受伪造 selected/correct，强化来源可在原报告淘汰后独立读取', () => {
    const memory = new MemoryStorage(); const store = new LocalStore(memory); const report = sampleReport();
    const broken = structuredClone(report); broken.answers![0].correct = !broken.answers![0].correct;
    expect(() => store.save(broken)).toThrow();
    const source = sourceSnapshot(report, confusionPairs(report.answers!));
    const s = new Session({ mode: 'reinforcement', key: 'C', count: 21, muted: false, source });
    const record = s.finish(); store.save(record);
    expect(new LocalStore(memory).data.sessions[0].reinforcementSource).toEqual(source);
  });
  it('已存的派生摘要以首次答案校正，不改变答案', () => {
    const memory = new MemoryStorage(); const report: SessionRecord = sampleReport();
    report.summary = { ...report.summary, correct: 0, wrong: 35 };
    memory.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 2, settings: DEFAULT_SETTINGS, sessions: [report] }));
    expect(new LocalStore(memory).data.sessions[0].summary.correct).toBe(32);
  });
});

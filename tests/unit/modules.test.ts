import { expect, it } from 'vitest';
import { Session } from '../../src/session';
import { BACKUP_KEY, BACKUP_V2_KEY, DEFAULT_MODULE_SETTINGS, DEFAULT_SETTINGS, LocalStore, STORAGE_KEY, validSession } from '../../src/storage';
import { sourceSnapshot } from '../../src/reinforcement';
import { confusionPairs } from '../../src/confusion';
import { feedbackView, quizView } from '../../src/views';
import type { SessionRecord } from '../../src/types';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
function notationReport() {
  const session = new Session({ module: 'notation', mode: 'exam', key: 'F#', count: 7, muted: false });
  session.ready(); session.submit(session.question.correctAnswer === 'do' ? 'fa' : 'do', false);
  return session.finish();
}
function legacyV2(records: SessionRecord[]) {
  return JSON.stringify({ schemaVersion: 2,
    settings: { ...DEFAULT_MODULE_SETTINGS, key: 'F#', practiceQuestionCount: 7, examQuestionCount: 21, lastMainMode: 'exam', volume: .4, muted: true },
    sessions: records.map(({ module: _module, ...record }) => record),
  });
}
it('听音只在整对播放完成后开放首次答案并计时；重听不会重置计时', () => {
  let clock = 0;
  const session = new Session({ module: 'relative', mode: 'exam', key: 'D', count: 7, muted: false }, () => clock);
  expect(session.ready()).toBe(false);
  session.beginPlayback(); clock = 5000;
  expect(session.submit('do', false)).toBe(false);
  session.completePlayback(); clock = 6000;
  session.replay(); session.beginPlayback(); clock = 8500; session.completePlayback(); clock = 9000;
  expect(session.submit(session.question.correctAnswer, true)).toBe(false);
  expect(session.submit(session.question.correctAnswer, false)).toBe(true);
  expect(session.currentAnswer).toMatchObject({ reactionMs: 4000, replaysBeforeAnswer: 1 });
  expect(session.phase).toBe('examAnswerRecorded');
  expect(session.finish()).toMatchObject({ module: 'relative', summary: { correct: 1 } });
});
it('在参考音和目标音之间暂停，保留原题；旧完成回调不能解除暂停，首次耗时无效', () => {
  const session = new Session({ module: 'relative', mode: 'practice', key: 'F#', count: 7, muted: false });
  const original = structuredClone(session.question);
  session.beginPlayback(); session.suspend();
  expect(session.completePlayback()).toBe(false);
  session.resume(); expect(session.phase).toBe('loading');
  expect(session.submit('do', false)).toBe(false);
  session.beginPlayback(); session.completePlayback(); session.submit(original.correctAnswer, false);
  expect(session.question).toEqual(original);
  expect(session.currentAnswer).toMatchObject({ correct: true, reactionMs: null, interruptedBeforeAnswer: true });
  const answer = structuredClone(session.currentAnswer);
  session.replay(); session.beginPlayback(); session.suspend(); session.resume();
  expect(session.phase).toBe('practiceFeedback');
  expect(session.currentAnswer?.selected).toBe(answer?.selected);
  expect(session.submit('fa', false)).toBe(false);
});
it('听音考试 DOM 没有题面数字、目标音名或正确项提示，答对答错反馈一致', () => {
  for (const correct of [true, false]) {
    const session = new Session({ module: 'relative', mode: 'exam', key: 'F#', count: 7, muted: false });
    session.beginPlayback();
    expect(quizView(session)).not.toMatch(/question-number|简谱数字|data-degree|正确答案|目标音：|E♯5/);
    expect(quizView(session)).toContain('正在播放参考 do 与目标音');
    session.completePlayback();
    const choice = correct ? session.question.correctAnswer : session.question.options.find(o => o !== session.question.correctAnswer)!;
    session.submit(choice, false);
    expect(feedbackView(session)).toBe('<p>答案已记录，请继续下一题。</p>');
    expect(quizView(session)).not.toMatch(/answer correct|answer incorrect|正确唱名|目标音：|data-degree/);
  }
});
it('两模块答后播放锁定下一题，暂停恢复不改首次答案、耗时或手动重听次数', () => {
  for (const module of ['notation', 'relative'] as const) for (const mode of ['practice', 'exam'] as const) {
    let clock = 1000;
    const session = new Session({ module, mode, key: 'D', count: 7, muted: false }, () => clock);
    if (module === 'relative') { session.beginPlayback(); session.completePlayback(); } else session.ready();
    clock = 1500;
    session.submit(session.question.correctAnswer, false);
    const original = structuredClone(session.currentAnswer);
    expect(session.beginPlayback()).toBe(true);
    expect(session.beginPlayback()).toBe(false);
    expect(session.next()).toBe(false);
    expect(session.submit('do', false)).toBe(false);
    expect(quizView(session)).toMatch(/data-action="next"[^>]*disabled/);
    session.suspend();
    expect(session.visiblePhase).toBe('listening');
    expect(session.completePlayback()).toBe(false);
    session.resume(); session.beginPlayback(); clock = 5000; session.completePlayback();
    expect(session.currentAnswer).toEqual(original);
    expect(session.currentAnswer).toMatchObject({ reactionMs: 500, replaysBeforeAnswer: 0, replaysAfterAnswer: 0 });
    expect(session.phase).toBe(mode === 'exam' ? 'examAnswerRecorded' : 'practiceFeedback');
    expect(session.next()).toBe(true);
  }
});
it('旧 v2 逐题记录和强化快照归入简谱，先备份再保存 v3，两个模块设置分离', () => {
  const exam = notationReport(), source = sourceSnapshot(exam, confusionPairs(exam.answers!));
  const reinforcement = new Session({ module: 'notation', mode: 'reinforcement', key: 'F#', count: 21, muted: false, source }).finish();
  const memory = new MemoryStorage(), original = legacyV2([exam, reinforcement]);
  memory.setItem(STORAGE_KEY, original); memory.setItem(BACKUP_KEY, 'older-v1-backup');
  const store = new LocalStore(memory);
  expect(store.data.schemaVersion).toBe(3);
  expect(memory.getItem(BACKUP_V2_KEY)).toBe(original);
  expect(memory.getItem(BACKUP_KEY)).toBe('older-v1-backup');
  expect(store.data.sessions.find(s => s.id === exam.id)).toEqual(exam);
  expect(store.data.sessions.find(s => s.id === reinforcement.id)).toEqual(reinforcement);
  expect(store.data.settings.modules.notation).toMatchObject({ key: 'F#', practiceQuestionCount: 7, examQuestionCount: 21 });
  expect(store.data.settings.modules.relative).toEqual(DEFAULT_MODULE_SETTINGS);
  store.updateSettings({ ...store.data.settings, modules: { ...store.data.settings.modules, relative: { ...DEFAULT_MODULE_SETTINGS, key: 'D' } } });
  expect(new LocalStore(memory).data.settings.modules.notation.key).toBe('F#');
  expect(new LocalStore(memory).data.settings.modules.relative.key).toBe('D');
});
it('v2 备份失败不覆盖旧键；未知模块不伪装为简谱；听音记录不得进入简谱强化', () => {
  const memory = new MemoryStorage(), original = legacyV2([notationReport()]);
  memory.setItem(STORAGE_KEY, original);
  const failBackup = { getItem: memory.getItem.bind(memory), removeItem: memory.removeItem.bind(memory), setItem: (key: string, value: string) => { if (key === BACKUP_V2_KEY) throw new Error('backup denied'); memory.setItem(key, value); } };
  const store = new LocalStore(failBackup); store.save(notationReport());
  expect(memory.getItem(STORAGE_KEY)).toBe(original); expect(store.notice).toContain('原始数据未覆盖');
  const exam = { ...notationReport(), module: 'relative' as const };
  expect(validSession({ ...exam, module: 'unknown' })).toBe(false);
  expect(() => sourceSnapshot(exam, confusionPairs(exam.answers!))).toThrow('简谱强化');
  expect(() => new Session({ module: 'relative', mode: 'reinforcement', key: 'C', count: 21, muted: false })).toThrow();
  const invalid = JSON.stringify({ schemaVersion: 3, settings: DEFAULT_SETTINGS, sessions: [{ ...exam, module: 'unknown' }] });
  memory.setItem(STORAGE_KEY, invalid); const unknown = new LocalStore(memory); unknown.updateSettings(DEFAULT_SETTINGS);
  expect(memory.getItem(STORAGE_KEY)).toBe(invalid);
});

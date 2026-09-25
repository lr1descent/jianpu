import { DEGREES, KEYS, SOLFEGE, pitch, solfege } from './music';
import { summarize } from './statistics';
import type { AnswerRecord, SavedData, SessionRecord, Settings, Summary } from './types';

export const STORAGE_KEY = 'jianpu-solfege-trainer';
export const BACKUP_KEY = `${STORAGE_KEY}:backup`;
export const DEFAULT_SETTINGS: Settings = { key: 'C', practiceQuestionCount: 21, examQuestionCount: 35, lastMainMode: 'practice', volume: 0.3, muted: false };
const emptyData = (): SavedData => ({ schemaVersion: 2, settings: { ...DEFAULT_SETTINGS }, sessions: [] });
type JsonObject = Record<string, unknown>;
const object = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown) => v === 7 || v === 21 || v === 35;
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const integer = (v: unknown): v is number => nonnegative(v) && Number.isInteger(v);
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const key = (v: unknown): v is Settings['key'] => KEYS.some(k => k.id === v);
function validSettings(v: unknown): v is Settings {
  return object(v) && key(v.key) && count(v.practiceQuestionCount) && count(v.examQuestionCount)
    && ['practice', 'exam'].includes(String(v.lastMainMode)) && nonnegative(v.volume) && v.volume <= 1 && typeof v.muted === 'boolean';
}
function validSummary(v: unknown): v is Summary {
  if (!object(v) || !integer(v.answered) || !integer(v.correct) || !integer(v.wrong) || v.answered !== v.correct + v.wrong
    || !(v.medianCorrectReactionMs === null || nonnegative(v.medianCorrectReactionMs)) || !object(v.perDegree)) return false;
  return DEGREES.every(d => {
    const row = (v.perDegree as JsonObject)[d];
    return object(row) && integer(row.answered) && integer(row.correct) && integer(row.wrong) && row.answered === row.correct + row.wrong;
  });
}
function validAnswer(v: unknown, sessionKey: Settings['key']): v is AnswerRecord {
  if (!object(v) || !DEGREES.includes(v.degree as never) || !SOLFEGE.includes(v.selected as never)) return false;
  const expected = pitch(sessionKey, v.degree as AnswerRecord['degree']);
  return typeof v.questionId === 'string' && integer(v.questionIndex) && v.midi === expected.midi && v.displayNote === expected.displayNote
    && v.correct === (v.selected === solfege(v.degree as AnswerRecord['degree']))
    && (v.reactionMs === null || nonnegative(v.reactionMs)) && integer(v.replaysBeforeAnswer) && integer(v.replaysAfterAnswer)
    && typeof v.interruptedBeforeAnswer === 'boolean' && typeof v.mutedAtAnswer === 'boolean'
    && (!v.interruptedBeforeAnswer || v.reactionMs === null);
}
export function validSession(v: unknown): v is SessionRecord {
  if (!object(v) || typeof v.id !== 'string' || !['practice', 'exam', 'reinforcement'].includes(String(v.mode))
    || !key(v.key) || !count(v.plannedQuestions) || !date(v.endedAt) || !(v.startedAt === null || date(v.startedAt))
    || typeof v.endedEarly !== 'boolean' || !validSummary(v.summary)
    || ![true, false, null].includes(v.audioEverMuted as never) || ![true, false, null].includes(v.audioEverInterrupted as never)) return false;
  if (v.answers === null) return v.mode === 'practice' && v.legacySummaryOnly === true;
  const sessionKey = v.key;
  if (v.mode !== 'reinforcement' && v.reinforcementSource !== undefined) return false;
  if (!Array.isArray(v.answers) || !v.answers.every(a => validAnswer(a, sessionKey)) || v.answers.length > Number(v.plannedQuestions)
    || new Set(v.answers.map(a => a.questionId)).size !== v.answers.length
    || !v.answers.every((a, i) => a.questionIndex === i) || v.endedEarly !== (v.answers.length < Number(v.plannedQuestions))) return false;
  if (v.mode === 'reinforcement') {
    const s = v.reinforcementSource;
    if (v.plannedQuestions !== 21 || !object(s) || typeof s.examId !== 'string' || s.examKey !== v.key || !date(s.examEndedAt)
      || !count(s.examPlannedQuestions) || !integer(s.examAnswered) || !integer(s.examCorrect) || s.examCorrect > s.examAnswered
      || typeof s.examEndedEarly !== 'boolean' || !Array.isArray(s.selectedPairs) || !s.selectedPairs.length
      || !s.selectedPairs.every(p => object(p) && DEGREES.includes(p.a as never) && DEGREES.includes(p.b as never) && Number(p.a) < Number(p.b)
        && integer(p.aToB) && integer(p.bToA) && Number(p.total) > 0 && p.total === p.aToB + p.bToA)
      || !Array.isArray(s.targetDegrees)) return false;
    const target = [...new Set(s.selectedPairs.flatMap(p => [p.a, p.b]))].sort();
    if (JSON.stringify(target) !== JSON.stringify(s.targetDegrees)) return false;
  }
  // Derived statistics are rebuilt from the preserved first answers on read.
  return true;
}
function normalized(sessions: SessionRecord[]) {
  const unique = [...new Map(sessions.map(s => [s.id, s])).values()];
  return unique.sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt)).slice(0, 100)
    .map(s => ({ ...s, summary: s.answers ? summarize(s.answers) : s.summary }));
}
export function migrateV1(value: unknown): SavedData {
  if (!object(value) || value.schemaVersion !== 1 || !object(value.settings) || !Array.isArray(value.sessions)) throw new Error('无法识别旧版数据结构');
  const old = value.settings;
  const settings = { ...DEFAULT_SETTINGS, key: old.key, volume: old.volume, muted: old.muted,
    practiceQuestionCount: old.practiceQuestionCount ?? old.questionCount };
  if (!validSettings(settings)) throw new Error('旧版设置不完整');
  const sessions = value.sessions.map(raw => {
    if (!object(raw) || typeof raw.id !== 'string' || !key(raw.key) || !count(raw.plannedQuestions)
      || !date(raw.endedAt) || !validSummary(raw.summary)) throw new Error('旧版摘要无法安全迁移');
    return { id: raw.id, mode: 'practice' as const, key: raw.key, plannedQuestions: raw.plannedQuestions as SessionRecord['plannedQuestions'],
      startedAt: date(raw.startedAt) ? raw.startedAt : null, endedAt: raw.endedAt,
      endedEarly: raw.summary.answered < Number(raw.plannedQuestions), audioEverMuted: null, audioEverInterrupted: null,
      answers: null, summary: raw.summary, legacySummaryOnly: true };
  });
  return { schemaVersion: 2, settings, sessions: normalized(sessions) };
}
export class LocalStore {
  data = emptyData();
  notice = '';
  private writable = true;
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) { this.load(); }
  private load() {
    let raw: string | null;
    try { raw = this.storage.getItem(STORAGE_KEY); }
    catch { this.writable = false; this.notice = '浏览器无法读取本地存储。本次仅在内存中运行，记录不会持久保存。'; return; }
    if (!raw) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (object(parsed) && parsed.schemaVersion === 2 && validSettings(parsed.settings)
        && Array.isArray(parsed.sessions) && parsed.sessions.every(validSession)) {
        this.data = { schemaVersion: 2, settings: parsed.settings, sessions: normalized(parsed.sessions) };
        return;
      }
      const migrated = migrateV1(parsed);
      if (this.storage.getItem(BACKUP_KEY) === null) this.storage.setItem(BACKUP_KEY, raw);
      this.storage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      this.data = migrated;
      this.notice = '已保留旧版摘要记录，并备份原始数据。旧记录没有具体选项，不能生成混淆分析。';
    } catch {
      this.writable = false;
      this.notice = '本地数据损坏、版本未知或备份失败。原始数据未覆盖，本次仅在内存中运行；新记录不会持久保存。';
    }
  }
  private persist() {
    if (!this.writable) return;
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify(this.data)); this.notice = ''; }
    catch { this.notice = '本地保存失败，记录暂存于本次页面。请留在当前页面，检查浏览器存储权限或可用空间后重试。'; }
  }
  retry() { this.persist(); }
  updateSettings(settings: Settings) { this.data = { ...this.data, settings: { ...settings } }; this.persist(); }
  save(record: SessionRecord) {
    if (!validSession(record)) throw new Error('记录校验失败，不能保存不一致的首次答案');
    if (this.data.sessions.some(s => s.id === record.id)) return;
    this.data = { ...this.data, sessions: normalized([...this.data.sessions, structuredClone(record)]) };
    this.persist();
  }
  clearHistory() {
    // Explicit user confirmation is handled by the UI; no same-origin-wide clear().
    this.data = { ...this.data, sessions: [] };
    try { this.storage.removeItem(BACKUP_KEY); }
    catch { this.notice = '无法移除旧版备份，清理尚未完成。请检查浏览器存储权限。'; return; }
    this.persist();
  }
}

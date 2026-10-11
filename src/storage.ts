import { DEGREES, KEYS, SOLFEGE, pitch, solfege } from './music';
import { summarize, summarizeKeyboard } from './statistics';
import { DEFAULT_KEYBOARD_SETTINGS, KEYBOARD_COUNTS, PITCH_CLASSES, keyboardNote } from './keyboard';
import type { AnswerRecord, FirstAnswer, KeyboardSessionRecord, KeyboardSettings, ModuleSettings, PitchClass, PracticeRecord, SavedData, SessionRecord, Settings, Summary } from './types';

export const STORAGE_KEY = 'jianpu-solfege-trainer';
export const BACKUP_KEY = `${STORAGE_KEY}:backup`;
export const BACKUP_V2_KEY = `${STORAGE_KEY}:backup:v2`;
export const BACKUP_V3_KEY = `${STORAGE_KEY}:backup:v3`;
export const DEFAULT_MODULE_SETTINGS: ModuleSettings = { key: 'C', practiceQuestionCount: 21, examQuestionCount: 35, lastMainMode: 'practice' };
export const DEFAULT_SETTINGS: Settings = { modules: { notation: { ...DEFAULT_MODULE_SETTINGS }, relative: { ...DEFAULT_MODULE_SETTINGS }, keyboard: { ...DEFAULT_KEYBOARD_SETTINGS } }, volume: 0.3, muted: false };
const emptyData = (): SavedData => ({ schemaVersion: 4, settings: structuredClone(DEFAULT_SETTINGS), sessions: [] });
type JsonObject = Record<string, unknown>;
const object = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);
const count = (v: unknown) => v === 7 || v === 21 || v === 35;
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const integer = (v: unknown): v is number => nonnegative(v) && Number.isInteger(v);
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const key = (v: unknown): v is ModuleSettings['key'] => KEYS.some(k => k.id === v);
function validModuleSettings(v: unknown): v is ModuleSettings {
  return object(v) && key(v.key) && count(v.practiceQuestionCount) && count(v.examQuestionCount)
    && ['practice', 'exam'].includes(String(v.lastMainMode));
}
function validVolume(v: JsonObject) { return nonnegative(v.volume) && v.volume <= 1 && typeof v.muted === 'boolean'; }
type LegacySettings = Omit<Settings, 'modules'> & { modules: Pick<Settings['modules'], 'notation' | 'relative'> };
function validLegacySettings(v: unknown): v is LegacySettings {
  return object(v) && validVolume(v) && object(v.modules)
    && validModuleSettings(v.modules.notation) && validModuleSettings(v.modules.relative);
}
function validKeyboardSettings(v: unknown): v is KeyboardSettings {
  return object(v) && (v.direction === 'name-to-key' || v.direction === 'key-to-name') && KEYBOARD_COUNTS.includes(v.questionCount as never);
}
function validSettings(v: unknown): v is Settings {
  return object(v) && object(v.modules) && validKeyboardSettings(v.modules.keyboard) && validLegacySettings(v);
}
function validSummaryTotals(v: unknown): v is Omit<Summary, 'perDegree'> & JsonObject {
  return object(v) && integer(v.answered) && integer(v.correct) && integer(v.wrong) && v.answered === v.correct + v.wrong
    && (v.medianCorrectReactionMs === null || nonnegative(v.medianCorrectReactionMs));
}
function validBuckets(v: unknown, targets: readonly number[]) {
  return object(v) && targets.every(d => {
    const row = v[d];
    return object(row) && integer(row.answered) && integer(row.correct) && integer(row.wrong) && row.answered === row.correct + row.wrong;
  });
}
function validSummary(v: unknown): v is Summary {
  return validSummaryTotals(v) && validBuckets(v.perDegree, DEGREES);
}
function validFirstAnswer(v: JsonObject) {
  return typeof v.questionId === 'string' && integer(v.questionIndex)
    && (v.reactionMs === null || nonnegative(v.reactionMs)) && integer(v.replaysBeforeAnswer) && integer(v.replaysAfterAnswer)
    && typeof v.interruptedBeforeAnswer === 'boolean' && typeof v.mutedAtAnswer === 'boolean'
    && (!v.interruptedBeforeAnswer || v.reactionMs === null);
}
function validAnswerOrder(answers: FirstAnswer<unknown>[], planned: number, endedEarly: unknown) {
  return answers.length <= planned && new Set(answers.map(a => a.questionId)).size === answers.length
    && answers.every((a, i) => a.questionIndex === i) && endedEarly === (answers.length < planned);
}
function validAnswer(v: unknown, sessionKey: ModuleSettings['key']): v is AnswerRecord {
  if (!object(v) || !DEGREES.includes(v.degree as never) || !SOLFEGE.includes(v.selected as never)) return false;
  const expected = pitch(sessionKey, v.degree as AnswerRecord['degree']);
  return validFirstAnswer(v) && v.midi === expected.midi && v.displayNote === expected.displayNote
    && v.correct === (v.selected === solfege(v.degree as AnswerRecord['degree']));
}
export function validSession(v: unknown): v is SessionRecord {
  if (!object(v) || typeof v.id !== 'string' || !['practice', 'exam', 'reinforcement'].includes(String(v.mode))
    || !['notation', 'relative'].includes(String(v.module))
    || !key(v.key) || !count(v.plannedQuestions) || !date(v.endedAt) || !(v.startedAt === null || date(v.startedAt))
    || typeof v.endedEarly !== 'boolean' || !validSummary(v.summary)
    || ![true, false, null].includes(v.audioEverMuted as never) || ![true, false, null].includes(v.audioEverInterrupted as never)) return false;
  if (v.answers === null) return v.module === 'notation' && v.mode === 'practice' && v.legacySummaryOnly === true;
  const sessionKey = v.key;
  if (v.mode !== 'reinforcement' && v.reinforcementSource !== undefined) return false;
  if (!Array.isArray(v.answers) || !v.answers.every(a => validAnswer(a, sessionKey))
    || !validAnswerOrder(v.answers, Number(v.plannedQuestions), v.endedEarly)) return false;
  if (v.module === 'relative' && v.answers.some(a => a.mutedAtAnswer)) return false;
  if (v.mode === 'reinforcement') {
    const s = v.reinforcementSource;
    if (v.module !== 'notation' || v.plannedQuestions !== 21 || !object(s) || typeof s.examId !== 'string' || s.examKey !== v.key || !date(s.examEndedAt)
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
export function validKeyboardSession(v: unknown): v is KeyboardSessionRecord {
  if (!object(v) || v.module !== 'keyboard' || v.mode !== 'practice' || typeof v.id !== 'string'
    || !validKeyboardSettings({ direction: v.direction, questionCount: v.plannedQuestions })
    || !date(v.startedAt) || !date(v.endedAt) || typeof v.endedEarly !== 'boolean'
    || !validSummaryTotals(v.summary) || !validBuckets(v.summary.perPitch, PITCH_CLASSES)
    || v.reinforcementSource !== undefined || !Array.isArray(v.answers)) return false;
  const validAnswers = v.answers.every(a => object(a) && validFirstAnswer(a)
    && PITCH_CLASSES.includes(a.pitchClass as never) && PITCH_CLASSES.includes(a.selected as never)
    && typeof a.promptName === 'string' && keyboardNote(a.pitchClass as PitchClass).names.includes(a.promptName)
    && a.correct === (a.selected === a.pitchClass)
    && a.replaysBeforeAnswer === 0 && a.replaysAfterAnswer === 0);
  return validAnswers && validAnswerOrder(v.answers, Number(v.plannedQuestions), v.endedEarly);
}
const validRecord = (v: unknown): v is PracticeRecord => validSession(v) || validKeyboardSession(v);
function normalized(sessions: PracticeRecord[]): PracticeRecord[] {
  const unique = [...new Map(sessions.map(s => [s.id, s])).values()];
  return unique.sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt)).slice(0, 100)
    .map(s => s.module === 'keyboard' ? { ...s, summary: summarizeKeyboard(s.answers) }
      : { ...s, summary: s.answers ? summarize(s.answers) : s.summary });
}
export function migrateV1(value: unknown): SavedData {
  if (!object(value) || value.schemaVersion !== 1 || !object(value.settings) || !Array.isArray(value.sessions)) throw new Error('无法识别旧版数据结构');
  const old = value.settings;
  const notation = { ...DEFAULT_MODULE_SETTINGS, key: old.key,
    practiceQuestionCount: old.practiceQuestionCount ?? old.questionCount };
  if (!validModuleSettings(notation) || !validVolume(old)) throw new Error('旧版设置不完整');
  const settings: Settings = { modules: { notation, relative: { ...DEFAULT_MODULE_SETTINGS }, keyboard: { ...DEFAULT_KEYBOARD_SETTINGS } }, volume: old.volume as number, muted: old.muted as boolean };
  const sessions = value.sessions.map(raw => {
    if (!object(raw) || typeof raw.id !== 'string' || !key(raw.key) || !count(raw.plannedQuestions)
      || !date(raw.endedAt) || !validSummary(raw.summary)) throw new Error('旧版摘要无法安全迁移');
    return { id: raw.id, module: 'notation' as const, mode: 'practice' as const, key: raw.key, plannedQuestions: raw.plannedQuestions as SessionRecord['plannedQuestions'],
      startedAt: date(raw.startedAt) ? raw.startedAt : null, endedAt: raw.endedAt,
      endedEarly: raw.summary.answered < Number(raw.plannedQuestions), audioEverMuted: null, audioEverInterrupted: null,
      answers: null, summary: raw.summary, legacySummaryOnly: true };
  });
  return { schemaVersion: 4, settings, sessions: normalized(sessions) };
}
export function migrateV2(value: unknown): SavedData {
  if (!object(value) || value.schemaVersion !== 2 || !validModuleSettings(value.settings)
    || !validVolume(value.settings as unknown as JsonObject) || !Array.isArray(value.sessions)) throw new Error('无法识别 schema v2 数据');
  const old = value.settings as ModuleSettings & Pick<Settings, 'volume' | 'muted'>;
  const { key, practiceQuestionCount, examQuestionCount, lastMainMode } = old;
  const settings: Settings = { volume: old.volume, muted: old.muted, modules: {
    notation: { key, practiceQuestionCount, examQuestionCount, lastMainMode }, relative: { ...DEFAULT_MODULE_SETTINGS }, keyboard: { ...DEFAULT_KEYBOARD_SETTINGS },
  } };
  const sessions = value.sessions.map(raw => {
    if (!object(raw) || raw.module !== undefined) throw new Error('旧版记录模块无效');
    const record = { ...raw, module: 'notation' };
    if (!validSession(record)) throw new Error('旧版记录无法安全迁移');
    return record;
  });
  return { schemaVersion: 4, settings, sessions: normalized(sessions) };
}
export function migrateV3(value: unknown): SavedData {
  if (!object(value) || value.schemaVersion !== 3 || !validLegacySettings(value.settings)
    || !Array.isArray(value.sessions) || !value.sessions.every(validSession)) throw new Error('无法识别 schema v3 数据');
  return { schemaVersion: 4, settings: { ...value.settings, modules: { ...value.settings.modules, keyboard: { ...DEFAULT_KEYBOARD_SETTINGS } } },
    sessions: normalized(value.sessions) };
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
      if (object(parsed) && parsed.schemaVersion === 4 && validSettings(parsed.settings)
        && Array.isArray(parsed.sessions) && parsed.sessions.every(validRecord)) {
        this.data = { schemaVersion: 4, settings: parsed.settings, sessions: normalized(parsed.sessions) };
        return;
      }
      const fromV2 = object(parsed) && parsed.schemaVersion === 2;
      const fromV3 = object(parsed) && parsed.schemaVersion === 3;
      const migrated = fromV3 ? migrateV3(parsed) : fromV2 ? migrateV2(parsed) : migrateV1(parsed);
      const backup = fromV3 ? BACKUP_V3_KEY : fromV2 ? BACKUP_V2_KEY : BACKUP_KEY;
      if (this.storage.getItem(backup) === null) this.storage.setItem(backup, raw);
      this.storage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      this.data = migrated;
      this.notice = fromV3 ? '已添加键盘练习设置。原有练习记录完整保留，原始数据已备份。' : fromV2 ? '原有记录已归入简谱识读，首次答案和强化来源完整保留，原始数据已备份。' : '已保留旧版摘要记录，并备份原始数据。旧记录没有具体选项，不能生成混淆分析。';
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
  updateSettings(settings: Settings) { this.data = { ...this.data, settings: structuredClone(settings) }; this.persist(); }
  save(record: PracticeRecord) {
    if (!validRecord(record)) throw new Error('记录校验失败，不能保存不一致的首次答案');
    if (this.data.sessions.some(s => s.id === record.id)) return;
    this.data = { ...this.data, sessions: normalized([...this.data.sessions, structuredClone(record)]) };
    this.persist();
  }
  clearHistory() {
    // Explicit user confirmation is handled by the UI; no same-origin-wide clear().
    this.data = { ...this.data, sessions: [] };
    try { this.storage.removeItem(BACKUP_KEY); this.storage.removeItem(BACKUP_V2_KEY); this.storage.removeItem(BACKUP_V3_KEY); }
    catch { this.notice = '无法移除旧版备份，清理尚未完成。请检查浏览器存储权限。'; return; }
    this.persist();
  }
}

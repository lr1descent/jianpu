import { balancedSequence, makeQuestions, type Random } from './quiz';
import { reinforcementSequence } from './reinforcement';
import { summarize } from './statistics';
import type { AnswerRecord, KeyId, Mode, Question, QuestionCount, ReinforcementSource, SessionRecord, Solfege } from './types';

export type ActivePhase = 'loading' | 'answering' | 'practiceFeedback' | 'examAnswerRecorded';
export type Phase = ActivePhase | 'paused' | 'audioError' | 'result';
export interface SessionConfig { mode: Mode; key: KeyId; count: QuestionCount; muted: boolean; source?: ReinforcementSource }

export class Session {
  readonly id: string;
  readonly questions: Question[];
  readonly config: SessionConfig;
  readonly startedAt: string;
  phase: Phase = 'loading';
  previousPhase: ActivePhase = 'loading';
  index = 0;
  answers: AnswerRecord[] = [];
  audioEverMuted: boolean;
  audioEverInterrupted = false;
  error = '';
  private readyAt = 0;
  private interrupted = false;
  private replays = 0;
  private result?: SessionRecord;

  constructor(config: SessionConfig, private readonly now = () => performance.now(), random: Random = Math.random, id: string = crypto.randomUUID()) {
    if (config.mode !== 'reinforcement' && config.source) throw new Error('普通练习和考试不应携带强化来源');
    if (config.mode === 'reinforcement' && (!config.source || config.count !== 21 || config.key !== config.source.examKey)) {
      throw new Error('强化必须沿用来源考试调性，且固定 21 题');
    }
    this.config = structuredClone(config);
    this.id = id;
    this.startedAt = new Date().toISOString();
    this.audioEverMuted = config.muted;
    const degrees = config.mode === 'reinforcement' ? reinforcementSequence(config.source!.selectedPairs, random) : balancedSequence(config.count, random);
    this.questions = makeQuestions(id, config.key, degrees, random);
  }
  get question() { return this.questions[this.index]; }
  get currentAnswer() { return this.answers.find(a => a.questionId === this.question.id); }
  get visiblePhase() { return this.phase === 'paused' || this.phase === 'audioError' ? this.previousPhase : this.phase; }
  ready() {
    if (this.phase !== 'loading') return false;
    this.phase = 'answering';
    this.readyAt = this.now();
    return true;
  }
  submit(selected: Solfege, muted: boolean) {
    if (this.phase !== 'answering' || this.currentAnswer || !this.question.options.includes(selected)) return false;
    const q = this.question;
    this.answers = [...this.answers, { questionId: q.id, questionIndex: q.index, degree: q.degree,
      midi: q.midi, displayNote: q.displayNote, selected, correct: selected === q.correctAnswer,
      reactionMs: this.interrupted ? null : Math.max(0, this.now() - this.readyAt),
      replaysBeforeAnswer: this.replays, replaysAfterAnswer: 0, interruptedBeforeAnswer: this.interrupted, mutedAtAnswer: muted }];
    this.audioEverMuted ||= muted;
    this.phase = this.config.mode === 'exam' ? 'examAnswerRecorded' : 'practiceFeedback';
    return true;
  }
  next() {
    if (!['practiceFeedback', 'examAnswerRecorded'].includes(this.phase) || this.index === this.questions.length - 1) return false;
    this.index++;
    this.interrupted = false;
    this.replays = 0;
    this.phase = 'loading';
    return true;
  }
  replay() {
    if (!['answering', 'practiceFeedback', 'examAnswerRecorded'].includes(this.phase)) return false;
    if (this.currentAnswer) this.answers = this.answers.map(a => a.questionId === this.question.id ? { ...a, replaysAfterAnswer: a.replaysAfterAnswer + 1 } : a);
    else this.replays++;
    return true;
  }
  suspend(reason?: string) {
    if (this.phase === 'result') return;
    if (this.phase !== 'paused' && this.phase !== 'audioError') this.previousPhase = this.phase;
    if (!this.currentAnswer && this.previousPhase !== 'loading') this.interrupted = true;
    this.audioEverInterrupted = true;
    this.error = reason ?? '';
    this.phase = reason ? 'audioError' : 'paused';
  }
  resume() {
    if (this.phase !== 'paused' && this.phase !== 'audioError') return false;
    this.phase = this.previousPhase;
    if (this.phase === 'loading') this.ready();
    return true;
  }
  markMuted() { this.audioEverMuted = true; }
  finish(): SessionRecord {
    if (this.result) return structuredClone(this.result);
    this.phase = 'result';
    const answers = structuredClone(this.answers);
    this.result = { id: this.id, mode: this.config.mode, key: this.config.key,
      plannedQuestions: this.config.count, startedAt: this.startedAt, endedAt: new Date().toISOString(),
      endedEarly: answers.length !== this.config.count, audioEverMuted: this.audioEverMuted,
      audioEverInterrupted: this.audioEverInterrupted, answers, summary: summarize(answers),
      ...(this.config.source ? { reinforcementSource: structuredClone(this.config.source) } : {}) };
    return structuredClone(this.result);
  }
}

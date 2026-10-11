import type { FirstAnswer, Mode } from './types';

export type ActivePhase = 'loading' | 'listening' | 'answering' | 'practiceFeedback' | 'examAnswerRecorded';
export type Phase = ActivePhase | 'paused' | 'audioError' | 'result';
interface RoundQuestion { id: string; index: number; correctAnswer: string | number; options: readonly (string | number)[] }
interface RoundConfig { mode: Mode; count: number }
type AnswerGate = 'immediate' | 'after-audio';

// One lifecycle owns first-answer locking, interruption timing, playback and finalization.
export abstract class SessionCore<Q extends RoundQuestion, A extends FirstAnswer<Q['correctAnswer']>, C extends RoundConfig, R> {
  readonly id: string;
  readonly questions: Q[];
  readonly config: C;
  readonly startedAt = new Date().toISOString();
  phase: Phase = 'loading';
  previousPhase: ActivePhase = 'loading';
  index = 0;
  answers: A[] = [];
  audioEverMuted: boolean;
  audioEverInterrupted = false;
  error = '';
  private readyAt = 0;
  private afterPlayback: Exclude<ActivePhase, 'listening'> = 'loading';
  private interrupted = false;
  private replays = 0;
  private result?: R;
  private readonly answerGate: AnswerGate;
  private readonly requiresSound: boolean;

  protected constructor(definition: { id: string; config: C; questions: Q[]; answerGate: AnswerGate; requiresSound: boolean; muted: boolean }, private readonly now = () => performance.now()) {
    this.id = definition.id;
    this.config = structuredClone(definition.config);
    this.questions = definition.questions;
    this.answerGate = definition.answerGate;
    this.requiresSound = definition.requiresSound;
    this.audioEverMuted = definition.muted;
  }
  protected abstract makeAnswer(question: Q, first: FirstAnswer<Q['correctAnswer']>): A;
  protected abstract makeRecord(answers: A[]): R;
  protected recordIdentity() {
    return { id: this.id, startedAt: this.startedAt, endedAt: new Date().toISOString(), endedEarly: this.answers.length !== this.config.count };
  }
  get question() { return this.questions[this.index]; }
  get currentAnswer() { return this.answers.find(a => a.questionId === this.question.id); }
  get visiblePhase() { return this.phase === 'paused' || this.phase === 'audioError' ? this.previousPhase : this.phase; }
  ready(muted = false) {
    if (this.phase !== 'loading' || (this.answerGate === 'after-audio' && (!muted || this.requiresSound))) return false;
    this.openAnswers();
    return true;
  }
  private openAnswers() { this.phase = 'answering'; this.readyAt = this.now(); }
  beginPlayback() {
    if (this.answerGate === 'immediate' && !this.currentAnswer) return false;
    if (!['loading', 'answering', 'practiceFeedback', 'examAnswerRecorded'].includes(this.phase)) return false;
    this.afterPlayback = this.phase as Exclude<ActivePhase, 'listening'>;
    this.phase = 'listening';
    return true;
  }
  completePlayback() {
    if (this.phase !== 'listening') return false;
    this.phase = this.afterPlayback;
    // Replays never restart the reaction timer.
    if (this.phase === 'loading') this.openAnswers();
    return true;
  }
  submit(selected: Q['correctAnswer'], muted = false) {
    if (this.requiresSound && muted) return false;
    if (this.phase !== 'answering' || this.currentAnswer || !this.question.options.includes(selected)) return false;
    const q = this.question;
    this.answers = [...this.answers, this.makeAnswer(q, { questionId: q.id, questionIndex: q.index, selected,
      correct: selected === q.correctAnswer, reactionMs: this.interrupted ? null : Math.max(0, this.now() - this.readyAt),
      replaysBeforeAnswer: this.replays, replaysAfterAnswer: 0, interruptedBeforeAnswer: this.interrupted, mutedAtAnswer: muted })];
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
    if (!this.currentAnswer && (this.phase === 'listening' || this.visiblePhase !== 'loading')) this.interrupted = true;
    if (this.phase !== 'paused' && this.phase !== 'audioError') this.previousPhase = this.phase;
    this.audioEverInterrupted = true;
    this.error = reason ?? '';
    this.phase = reason ? 'audioError' : 'paused';
  }
  resume(muted = false) {
    if (this.phase !== 'paused' && this.phase !== 'audioError') return false;
    this.phase = this.previousPhase;
    if (this.phase === 'listening') this.phase = this.afterPlayback;
    if (this.phase === 'loading') this.ready(muted);
    return true;
  }
  markMuted() { this.audioEverMuted = true; }
  finish(): R {
    if (this.result) return structuredClone(this.result);
    this.phase = 'result';
    this.result = this.makeRecord(structuredClone(this.answers));
    return structuredClone(this.result);
  }
}

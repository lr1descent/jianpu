import { makeKeyboardQuestions } from './keyboard';
import { SessionCore } from './session-core';
import { summarizeKeyboard } from './statistics';
import type { Random } from './quiz';
import type { FirstAnswer, KeyboardAnswer, KeyboardDirection, KeyboardQuestion, KeyboardQuestionCount, KeyboardSessionRecord, PitchClass } from './types';

export interface KeyboardSessionConfig { module: 'keyboard'; mode: 'practice'; direction: KeyboardDirection; count: KeyboardQuestionCount }
export class KeyboardSession extends SessionCore<KeyboardQuestion, KeyboardAnswer, KeyboardSessionConfig, KeyboardSessionRecord> {
  constructor(config: KeyboardSessionConfig, now = () => performance.now(), random: Random = Math.random, id: string = crypto.randomUUID()) {
    if (config.module !== 'keyboard' || config.mode !== 'practice' || !['name-to-key', 'key-to-name'].includes(config.direction)) throw new Error('键盘练习方向或模式无效');
    super({ id, config, questions: makeKeyboardQuestions(id, config.count, random),
      answerGate: config.direction === 'key-to-name' ? 'after-audio' : 'immediate', requiresSound: false, muted: false }, now);
  }
  get shouldPlay() { return this.config.direction === 'name-to-key' ? !!this.currentAnswer : !this.currentAnswer; }
  override replay() { return false; }
  protected makeAnswer(q: KeyboardQuestion, first: FirstAnswer<PitchClass>): KeyboardAnswer {
    return { ...first, pitchClass: q.pitchClass, promptName: q.promptName };
  }
  protected makeRecord(answers: KeyboardAnswer[]): KeyboardSessionRecord {
    return { ...this.recordIdentity(), module: 'keyboard', mode: 'practice', direction: this.config.direction,
      plannedQuestions: this.config.count, answers, summary: summarizeKeyboard(answers) };
  }
}

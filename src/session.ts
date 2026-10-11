import { balancedSequence, makeQuestions, type Random } from './quiz';
import { reinforcementSequence } from './reinforcement';
import { summarize } from './statistics';
import { SessionCore } from './session-core';
import type { AnswerRecord, FirstAnswer, KeyId, Mode, Question, QuestionCount, ReinforcementSource, SessionRecord, Solfege, SolfegeModule } from './types';

export type { ActivePhase, Phase } from './session-core';
export interface SessionConfig { module: SolfegeModule; mode: Mode; key: KeyId; count: QuestionCount; muted: boolean; source?: ReinforcementSource }

export class Session extends SessionCore<Question, AnswerRecord, SessionConfig, SessionRecord> {
  constructor(config: SessionConfig, now = () => performance.now(), random: Random = Math.random, id: string = crypto.randomUUID()) {
    if (!['notation', 'relative'].includes(config.module)) throw new Error('未知练习模块');
    if (config.module === 'relative' && config.mode === 'reinforcement') throw new Error('考后强化仅用于简谱识读模块');
    if (config.mode !== 'reinforcement' && config.source) throw new Error('普通练习和考试不应携带强化来源');
    if (config.mode === 'reinforcement' && (!config.source || config.count !== 21 || config.key !== config.source.examKey)) {
      throw new Error('强化必须沿用来源考试调性，且固定 21 题');
    }
    const degrees = config.mode === 'reinforcement' ? reinforcementSequence(config.source!.selectedPairs, random) : balancedSequence(config.count, random);
    super({ id, config, questions: makeQuestions(id, config.key, degrees, random),
      answerGate: config.module === 'relative' ? 'after-audio' : 'immediate', requiresSound: config.module === 'relative', muted: config.muted }, now);
  }
  protected makeAnswer(q: Question, first: FirstAnswer<Solfege>): AnswerRecord {
    return { ...first, degree: q.degree, midi: q.midi, displayNote: q.displayNote };
  }
  protected makeRecord(answers: AnswerRecord[]): SessionRecord {
    return { ...this.recordIdentity(), module: this.config.module, mode: this.config.mode, key: this.config.key,
      plannedQuestions: this.config.count, audioEverMuted: this.audioEverMuted, audioEverInterrupted: this.audioEverInterrupted,
      answers, summary: summarize(answers), ...(this.config.source ? { reinforcementSource: structuredClone(this.config.source) } : {}) };
  }
}

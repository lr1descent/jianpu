export type Degree = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Solfege = 'do' | 're' | 'mi' | 'fa' | 'sol' | 'la' | 'si';
export type KeyId = 'C' | 'Db' | 'D' | 'Eb' | 'E' | 'F' | 'F#' | 'G' | 'Ab' | 'A' | 'Bb' | 'B';
export type Mode = 'practice' | 'exam' | 'reinforcement';
export type ExerciseModule = 'notation' | 'relative';
export type QuestionCount = 7 | 21 | 35;
export interface ModuleSettings {
  key: KeyId; practiceQuestionCount: QuestionCount; examQuestionCount: QuestionCount;
  lastMainMode: 'practice' | 'exam';
}
export interface Settings {
  modules: Record<ExerciseModule, ModuleSettings>;
  volume: number; muted: boolean;
}
export interface Question {
  id: string; index: number; key: KeyId; degree: Degree; midi: number;
  displayNote: string; correctAnswer: Solfege; options: Solfege[];
}
export interface AnswerRecord {
  questionId: string; questionIndex: number; degree: Degree; midi: number;
  displayNote: string; selected: Solfege; correct: boolean; reactionMs: number | null;
  replaysBeforeAnswer: number; replaysAfterAnswer: number;
  interruptedBeforeAnswer: boolean; mutedAtAnswer: boolean;
}
export interface PerDegreeStats { answered: number; correct: number; wrong: number }
export interface Summary {
  answered: number; correct: number; wrong: number; medianCorrectReactionMs: number | null;
  perDegree: Record<Degree, PerDegreeStats>;
}
export interface ConfusionPair { a: Degree; b: Degree; aToB: number; bToA: number; total: number }
export interface ReinforcementSource {
  examId: string; examKey: KeyId; examEndedAt: string; examPlannedQuestions: QuestionCount;
  examAnswered: number; examCorrect: number; examEndedEarly: boolean;
  selectedPairs: ConfusionPair[]; targetDegrees: Degree[];
}
export interface SessionRecord {
  id: string; module: ExerciseModule; mode: Mode; key: KeyId; plannedQuestions: QuestionCount;
  startedAt: string | null; endedAt: string; endedEarly: boolean;
  audioEverMuted: boolean | null; audioEverInterrupted: boolean | null;
  answers: AnswerRecord[] | null; summary: Summary;
  reinforcementSource?: ReinforcementSource; legacySummaryOnly?: boolean;
}
export interface SavedData { schemaVersion: 3; settings: Settings; sessions: SessionRecord[] }

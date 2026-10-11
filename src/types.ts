export type Degree = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Solfege = 'do' | 're' | 'mi' | 'fa' | 'sol' | 'la' | 'si';
export type KeyId = 'C' | 'Db' | 'D' | 'Eb' | 'E' | 'F' | 'F#' | 'G' | 'Ab' | 'A' | 'Bb' | 'B';
export type Mode = 'practice' | 'exam' | 'reinforcement';
export type SolfegeModule = 'notation' | 'relative';
export type ExerciseModule = SolfegeModule | 'keyboard';
export type QuestionCount = 7 | 21 | 35;
export interface ModuleSettings {
  key: KeyId; practiceQuestionCount: QuestionCount; examQuestionCount: QuestionCount;
  lastMainMode: 'practice' | 'exam';
}
export interface Settings {
  modules: Record<SolfegeModule, ModuleSettings> & { keyboard: KeyboardSettings };
  volume: number; muted: boolean;
}
export interface Question {
  id: string; index: number; key: KeyId; degree: Degree; midi: number;
  displayNote: string; correctAnswer: Solfege; options: Solfege[];
}
export interface FirstAnswer<Choice> {
  questionId: string; questionIndex: number; selected: Choice; correct: boolean; reactionMs: number | null;
  replaysBeforeAnswer: number; replaysAfterAnswer: number;
  interruptedBeforeAnswer: boolean; mutedAtAnswer: boolean;
}
export interface AnswerRecord extends FirstAnswer<Solfege> {
  degree: Degree; midi: number; displayNote: string;
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
  id: string; module: SolfegeModule; mode: Mode; key: KeyId; plannedQuestions: QuestionCount;
  startedAt: string | null; endedAt: string; endedEarly: boolean;
  audioEverMuted: boolean | null; audioEverInterrupted: boolean | null;
  answers: AnswerRecord[] | null; summary: Summary;
  reinforcementSource?: ReinforcementSource; legacySummaryOnly?: boolean;
}
export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type KeyboardDirection = 'name-to-key' | 'key-to-name';
export type KeyboardQuestionCount = 12 | 24 | 36;
export interface KeyboardSettings { direction: KeyboardDirection; questionCount: KeyboardQuestionCount }
export interface KeyboardQuestion {
  id: string; index: number; pitchClass: PitchClass; promptName: string;
  correctAnswer: PitchClass; options: PitchClass[];
}
export interface KeyboardAnswer extends FirstAnswer<PitchClass> { pitchClass: PitchClass; promptName: string }
export interface KeyboardSummary extends Omit<Summary, 'perDegree'> { perPitch: Record<PitchClass, PerDegreeStats> }
export interface KeyboardSessionRecord {
  id: string; module: 'keyboard'; mode: 'practice'; direction: KeyboardDirection; plannedQuestions: KeyboardQuestionCount;
  startedAt: string; endedAt: string; endedEarly: boolean;
  answers: KeyboardAnswer[]; summary: KeyboardSummary;
  reinforcementSource?: never; legacySummaryOnly?: never;
}
export type PracticeRecord = SessionRecord | KeyboardSessionRecord;
export interface SavedData { schemaVersion: 4; settings: Settings; sessions: PracticeRecord[] }

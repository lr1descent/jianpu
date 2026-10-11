import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/views.css';
import './styles/keyboard.css';
import './styles/motion.css';
import './styles/singing.css';
import { Piano } from './audio';
import { mountSinging } from './singing';
import { DEFAULT_SINGING_PREFERENCES, singingView } from './singing-view';
import { animateList, updateList } from './list-motion';
import { Session, type SessionConfig } from './session';
import { KeyboardSession, type KeyboardSessionConfig } from './keyboard-session';
import { keyboardMidi } from './keyboard';
import { keyboardAnswerClass, keyboardFeedbackView, keyboardPlaybackStatus, keyboardQuizView, keyboardResultView, keyboardSetupView, pianoKeyboardView } from './keyboard-views';
import { LocalStore } from './storage';
import { DEGREES, KEYS, keyInfo, pitch } from './music';
import { confusionPairs } from './confusion';
import { sourceSnapshot } from './reinforcement';
import { answerClass, escape, feedbackView, header, historyResultsView, historyView, homeView, learnView, modeName, moduleView, muted,
  nextLabel, playbackStatus, quizView, resultView, reviewView, runningSummary, setupView, volumeLabel } from './views';
import type { Degree, ExerciseModule, KeyboardDirection, KeyId, Mode, ModuleSettings, PitchClass, PracticeRecord, ReinforcementSource, Solfege, SolfegeModule } from './types';

type Page = 'home' | 'module' | 'setup' | 'keyboard-setup' | 'singing' | 'quiz' | 'result' | 'learn' | 'history' | 'review';
const app = document.querySelector<HTMLDivElement>('#app')!;
// Accessing localStorage itself can fail in restricted browsing contexts.
const storage = new LocalStore({
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: key => window.localStorage.removeItem(key),
});
const piano = new Piano();
let page: Page = 'home';
let exerciseModule: SolfegeModule = 'notation';
let setupMode: 'practice' | 'exam' = 'practice';
let session: Session | KeyboardSession | undefined;
let report: PracticeRecord | undefined;
let reinforcement: ReinforcementSource | undefined;
let selectedPairs = new Set<string>();
let historyFilter: Mode | 'all' = 'all';
let historyModule: ExerciseModule | 'all' = 'all';
let historyDirection: KeyboardDirection | 'all' = 'all';
let stopHistoryAnimation: (() => void) | undefined;
let singing: ReturnType<typeof mountSinging> | undefined;
let singingPreferences = { ...DEFAULT_SINGING_PREFERENCES };
let operation = 0;
let busy = false;
const settings = () => storage.data.settings;
const moduleSettings = () => settings().modules[exerciseModule];
const viewSettings = () => ({ ...settings(), ...moduleSettings() });
function updateModuleSettings(changes: Partial<ModuleSettings>) {
  storage.updateSettings({ ...settings(), modules: { ...settings().modules, [exerciseModule]: { ...moduleSettings(), ...changes } } });
}
const active = () => page === 'quiz' && session?.phase !== 'result';
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

function focusPage() { app.querySelector<HTMLElement>('#question, h1')?.focus({ preventScroll: true }); }
function noticeView() {
  return storage.notice ? `<aside class="storage-notice" role="status"><p>${escape(storage.notice)}</p><button class="button secondary" data-action="retry-save">重试保存</button></aside>` : '';
}
function render(focus = true) {
  singing?.dispose();
  singing = undefined;
  stopHistoryAnimation?.();
  stopHistoryAnimation = undefined;
  document.body.classList.toggle('is-quiz', page === 'quiz');
  const views: Record<Page, () => string> = {
    home: homeView, module: () => moduleView(exerciseModule), setup: () => setupView(exerciseModule, setupMode, viewSettings()),
    'keyboard-setup': () => keyboardSetupView(settings().modules.keyboard, settings()),
    singing: () => singingView(settings(), singingPreferences),
    quiz: () => session instanceof KeyboardSession ? keyboardQuizView(session, muted(settings())) : quizView(session!),
    learn: () => learnView(viewSettings()), history: () => historyView(storage.data.sessions, historyFilter, historyModule, historyDirection),
    review: () => reviewView(reinforcement!, settings()),
    result: () => report?.module === 'keyboard' ? keyboardResultView(report) : resultView(report!, selectedPairs, storage.data.sessions.some(s => s.id === report?.reinforcementSource?.examId)),
  };
  app.innerHTML = `${page === 'singing' ? '' : header(settings(), page === 'quiz' ? session : undefined)}${noticeView()}${views[page]()}`;
  updateMutedNote();
  if (focus) focusPage();
  if (page === 'history') stopHistoryAnimation = animateList(app.querySelector<HTMLElement>('#history-results')!);
  if (page === 'singing') singing = mountSinging({ root: app.querySelector<HTMLElement>('.singing-piano')!, audio: piano,
    preferences: singingPreferences, onPreference: preferences => { singingPreferences = preferences; }, isMuted: () => muted(settings()) });
}
function updateHistory() {
  const selected = { 'filter-module': historyModule, filter: historyFilter, 'filter-direction': historyDirection };
  app.querySelectorAll<HTMLButtonElement>('.history-filter button').forEach(button => {
    const action = button.dataset.action as keyof typeof selected;
    const value = button.dataset.module ?? button.dataset.filter ?? button.dataset.direction;
    button.setAttribute('aria-pressed', String(value === selected[action]));
    button.hidden = historyModule === 'relative' && value === 'reinforcement';
  });
  app.querySelector<HTMLElement>('#history-direction-filter')!.hidden = historyModule !== 'keyboard';
  app.querySelector<HTMLElement>('#history-mode-filter')!.hidden = historyModule === 'keyboard';
  updateList(app.querySelector<HTMLElement>('#history-results')!, historyResultsView(storage.data.sessions, historyFilter, historyModule, historyDirection));
}
function navigate(next: Page) {
  operation++;
  busy = false;
  piano.stop();
  page = next;
  render();
  window.scrollTo(0, 0);
}
function openReport(value: PracticeRecord) {
  report = value;
  selectedPairs = new Set(value.mode === 'exam' && value.answers ? confusionPairs(value.answers).map(p => `${p.a}-${p.b}`) : []);
  navigate('result');
}
function showDialog(title: string, description: string, actions: { label: string; run: () => void; primary?: boolean }[], cancel?: () => void) {
  closeDialog();
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const dialog = document.createElement('dialog');
  dialog.id = 'app-dialog';
  dialog.setAttribute('aria-labelledby', 'dialog-title');
  dialog.setAttribute('aria-describedby', 'dialog-description');
  dialog.innerHTML = `<h2 id="dialog-title">${escape(title)}</h2><p id="dialog-description" class="secondary-text">${escape(description)}</p><div class="dialog-actions">${actions.map((a, index) => `<button class="button ${a.primary ? 'primary' : 'secondary'}" data-index="${index}">${escape(a.label)}</button>`).join('')}</div>`;
  const dismiss = (run: () => void) => { dialog.close(); dialog.remove(); if (previousFocus?.isConnected) previousFocus.focus(); run(); };
  dialog.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-index]');
    if (target) dismiss(actions[Number(target.dataset.index)].run);
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); if (cancel) dismiss(cancel); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const first = buttons[0], last = buttons.at(-1)!;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector<HTMLButtonElement>('button')?.focus();
}
function closeDialog() { document.querySelector<HTMLDialogElement>('#app-dialog')?.remove(); }
function setPianoVolume() { piano.setVolume(settings().volume, muted(settings())); }
function updateMutedNote() {
  const note = document.querySelector('#muted-note');
  if (note) note.textContent = muted(settings()) ? ' 当前已静音，本轮会记录静音状态。' : '';
}
async function playQuestion() {
  if (!active() || !session || (session instanceof KeyboardSession && !session.shouldPlay)) return;
  const current = session, token = operation;
  try {
    const relative = current instanceof Session && current.config.module === 'relative';
    if (relative && muted(settings())) throw new Error('相对音程需要声音。请取消静音并设置大于 0 的音量，再继续本题。');
    const locked = current.beginPlayback();
    if (!locked && (relative || current.phase !== 'answering')) return;
    if (locked) syncPlaybackControls();
    const played = await (current instanceof KeyboardSession ? piano.play(keyboardMidi(current.question.pitchClass))
      : relative ? piano.playPair(keyInfo(current.config.key).tonicMidi, current.question.midi)
      : piano.play(current.question.midi));
    // Explicit muting cancels optional sound but must still release the controls.
    if (locked && (played || (!relative && muted(settings()))) && token === operation && current === session && current.completePlayback()) {
      syncPlaybackControls();
    }
  } catch (error) { if (token === operation) interrupt(message(error)); }
}
function syncPlaybackControls() {
  if (!session) return;
  if (!app.querySelector('.answers, #keyboard-stage')) { render(); return; }
  const listening = session.phase === 'listening';
  app.querySelectorAll<HTMLButtonElement>('.answer, button.piano-key').forEach(button => { button.disabled = session!.phase !== 'answering'; });
  const replay = app.querySelector<HTMLButtonElement>('[data-action="replay"]');
  if (replay) replay.disabled = listening;
  app.querySelector<HTMLButtonElement>('[data-action="next"]')!.disabled = !session.currentAnswer || listening;
  const status = app.querySelector('#playback-status');
  if (status) status.textContent = session instanceof KeyboardSession ? keyboardPlaybackStatus(session, muted(settings())) : playbackStatus(session);
}
async function presentQuestion() {
  if (!session) return;
  session.ready(muted(settings()));
  render();
  await playQuestion();
}
async function start(config: SessionConfig | KeyboardSessionConfig) {
  if (busy || active()) return;
  busy = true;
  const token = ++operation;
  piano.stop();
  setPianoVolume();
  session = config.module === 'keyboard' ? new KeyboardSession(config) : new Session(config);
  page = 'quiz';
  render();
  window.scrollTo(0, 0);
  try {
    if (config.module === 'relative' && muted(settings())) throw new Error('相对音程需要声音。请取消静音并设置大于 0 的音量，再继续本题。');
    if (!muted(settings())) await piano.initialize();
    if (token !== operation || !session) return;
    await presentQuestion();
  } catch (error) { if (token === operation) interrupt(message(error)); }
  finally { if (token === operation) busy = false; }
}
function startMain(mode = setupMode, key = moduleSettings().key, count = mode === 'exam' ? moduleSettings().examQuestionCount : moduleSettings().practiceQuestionCount, module = exerciseModule) {
  void start({ module, mode, key, count, muted: muted(settings()) });
}
function answer(selected: Solfege) {
  if (!active() || !(session instanceof Session) || !session.submit(selected, muted(settings()))) return;
  const current = session;
  // Update the existing live region and controls in place; no layout or option reshuffle.
  app.querySelectorAll<HTMLButtonElement>('.answer').forEach(button => {
    button.disabled = true;
    button.className = `answer ${answerClass(current, button.dataset.answer!)}`;
  });
  document.querySelector('#feedback')!.innerHTML = feedbackView(session);
  updateAnswerProgress();
  // System feedback replays the question, not the selected option, and is not a manual replay.
  void playQuestion();
}
function answerKeyboard(selected: PitchClass) {
  if (!active() || !(session instanceof KeyboardSession) || !session.submit(selected, muted(settings()))) return;
  const current = session;
  app.querySelector('#keyboard-stage')!.innerHTML = pianoKeyboardView(current);
  app.querySelectorAll<HTMLButtonElement>('.keyboard-note-options .answer').forEach(button => {
    button.disabled = true;
    button.className = `answer ${keyboardAnswerClass(current, Number(button.dataset.pitch))}`;
  });
  app.querySelector('#feedback')!.innerHTML = keyboardFeedbackView(current);
  updateAnswerProgress();
  syncPlaybackControls();
  void playQuestion();
}
function updateAnswerProgress() {
  if (!session) return;
  document.querySelector('#running-summary')!.textContent = runningSummary(session);
  (document.querySelector('.quiz-progress') as HTMLProgressElement).value = session.answers.length;
  const next = document.querySelector<HTMLButtonElement>('[data-action="next"]')!;
  next.disabled = false;
  next.textContent = nextLabel(session);
  // Focus the status, not the next button: a double native Enter must not also advance.
  const feedback = document.querySelector<HTMLElement>('#feedback')!;
  feedback.tabIndex = -1;
  feedback.focus({ preventScroll: true });
}
function next() {
  if (!session || !active() || !['practiceFeedback', 'examAnswerRecorded'].includes(session.phase)) return;
  piano.stop();
  if (session.index === session.questions.length - 1) { finish(); return; }
  if (session.next()) void presentQuestion();
}
function finish() {
  if (!session || !active()) return;
  operation++;
  busy = false;
  closeDialog();
  piano.stop();
  const result = session.finish();
  storage.save(result);
  openReport(result);
}
function interrupt(reason?: string) {
  if (!active() || !session) return;
  // A late initialize/resume callback must not resume a round after a newer interruption.
  operation++;
  busy = false;
  piano.stop();
  session.suspend(reason);
  pauseDialog();
}
function pauseDialog() {
  if (!session) return;
  const failed = session.phase === 'audioError';
  const requiresSound = session.config.module === 'relative';
  showDialog(failed ? '声音需要恢复' : `${modeName(session.config.mode)}已暂停`,
    failed ? session.error : '本题和已提交的答案已保留。点击继续后恢复练习与声音；中断前未作答的题目不计入速度统计。',
    [{ label: requiresSound && muted(settings()) ? (settings().volume === 0 ? '启用声音（30%）并继续' : '取消静音并继续') : failed ? '重试 / 启用声音' : '继续', primary: true, run: () => {
      if (requiresSound && muted(settings())) { storage.updateSettings({ ...settings(), muted: false, volume: settings().volume || 0.3 }); setPianoVolume(); }
      void resume();
    } },
      ...(failed && !requiresSound ? [{ label: '静音继续', run: () => { storage.updateSettings({ ...settings(), muted: true }); setPianoVolume(); session!.markMuted(); void resume(); } }] : []),
      { label: session.config.mode === 'exam' ? '提前交卷' : '结束本轮', run: () => confirmEnd() }]);
}
async function resume(returnFocus?: HTMLElement) {
  if (!session || !active()) return;
  const token = ++operation;
  busy = true;
  showDialog('正在恢复声音', '等待本地钢琴音色就绪，尚未开始计时。', [{ label: '结束本轮', run: () => confirmEnd() }]);
  try {
    if (!muted(settings())) await piano.initialize();
    if (token !== operation || !session) return;
    closeDialog();
    const needsPlayback = !session.currentAnswer || session.visiblePhase === 'listening';
    session.resume(muted(settings()));
    if (session.visiblePhase === 'answering' && !document.querySelector('#question')) render();
    syncPlaybackControls();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); else focusPage();
    soundUpdated();
    if (needsPlayback) await playQuestion();
  } catch (error) { if (token === operation) interrupt(message(error)); }
  finally { if (token === operation) busy = false; }
}
function confirmEnd() {
  if (!session || !active()) return;
  operation++;
  busy = false;
  piano.stop();
  const wasSuspended = session.phase === 'paused' || session.phase === 'audioError';
  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
  if (!wasSuspended) session.suspend();
  const cancel = () => { if (wasSuspended) pauseDialog(); else void resume(trigger); };
  showDialog(session.config.mode === 'exam' ? '提前交卷？' : '结束本轮？',
    '已作答的首次答案会保存，未作答题不计为错误。本轮将标为提前结束 / 部分完成。',
    [{ label: '取消', run: cancel }, { label: session.config.mode === 'exam' ? '确认交卷' : '确认结束', primary: true, run: finish }], cancel);
}
async function preview(degree: Degree, trigger: HTMLButtonElement) {
  if (busy || !DEGREES.includes(degree) || !['learn', 'review'].includes(page)) return;
  const token = ++operation;
  const key = page === 'review' ? reinforcement!.examKey : moduleSettings().key;
  busy = true;
  const status = document.querySelector('#preview-status')!;
  status.textContent = '正在准备钢琴音色…';
  setPianoVolume();
  try {
    if (!muted(settings())) await piano.initialize();
    if (token !== operation) return;
    const played = piano.play(pitch(key, degree).midi);
    status.textContent = muted(settings()) ? '当前已静音。可在声音设置中开启。' : `正在试听 ${degree} — ${trigger.querySelector('.note-mapping span')!.textContent}`;
    await played;
  } catch (error) {
    if (token === operation) status.textContent = `${message(error)} 点击音符可重试。`;
  } finally { if (token === operation) busy = false; }
}
function chooseReinforcement() {
  if (!report?.answers || report.module !== 'notation' || report.mode !== 'exam' || !selectedPairs.size) return;
  const pairs = confusionPairs(report.answers).filter(p => selectedPairs.has(`${p.a}-${p.b}`));
  reinforcement = sourceSnapshot(report, pairs);
  navigate('review');
}
function sourceReport() {
  const source = page === 'review' ? reinforcement : report?.reinforcementSource;
  const origin = storage.data.sessions.find(s => s.id === source?.examId);
  if (origin) openReport(origin);
}
app.addEventListener('click', event => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
  if (!target || target.disabled || event.detail > 1) return;
  const action = target.dataset.action;
  if (active() && !['answer', 'answer-keyboard', 'next', 'replay', 'pause', 'end', 'retry-save'].includes(action!)) return;
  switch (action) {
    case 'home': navigate('home'); break;
    case 'keyboard-module': navigate('keyboard-setup'); break;
    case 'singing-module': navigate('singing'); break;
    case 'module':
      if (target.dataset.module === 'notation' || target.dataset.module === 'relative') exerciseModule = target.dataset.module;
      navigate('module'); break;
    case 'learn': navigate('learn'); break;
    case 'history': navigate('history'); break;
    case 'setup-practice': case 'setup-exam':
      setupMode = action === 'setup-practice' ? 'practice' : 'exam';
      updateModuleSettings({ lastMainMode: setupMode });
      navigate('setup'); break;
    case 'start': startMain(); break;
    case 'start-keyboard': { const { direction, questionCount } = settings().modules.keyboard; void start({ module: 'keyboard', mode: 'practice', direction, count: questionCount }); break; }
    case 'answer': answer(target.dataset.answer as Solfege); break;
    case 'answer-keyboard': answerKeyboard(Number(target.dataset.pitch) as PitchClass); break;
    case 'pause': interrupt(); break;
    case 'next': next(); break;
    case 'replay': if (session?.replay()) void playQuestion(); break;
    case 'end': confirmEnd(); break;
    case 'preview': void preview(Number(target.dataset.degree) as Degree, target); break;
    case 'open-report': { const found = storage.data.sessions.find(s => s.id === target.dataset.id); if (found) openReport(found); break; }
    case 'filter': historyFilter = target.dataset.filter as Mode | 'all'; updateHistory(); break;
    case 'filter-module': historyModule = target.dataset.module as ExerciseModule | 'all'; historyFilter = 'all'; historyDirection = 'all'; updateHistory(); break;
    case 'filter-direction': historyDirection = target.dataset.direction as KeyboardDirection | 'all'; updateHistory(); break;
    case 'clear-history': showDialog('清空历史记录？', '将删除本应用保存的所有练习、考试与强化记录。声音和练习设置会保留。',
      [{ label: '取消', run: () => {} }, { label: '确认清空', run: () => { storage.clearHistory(); render(); } }], () => {}); break;
    case 'reinforce': chooseReinforcement(); break;
    case 'start-reinforcement': if (reinforcement) void start({ module: 'notation', mode: 'reinforcement', key: reinforcement.examKey, count: 21, muted: muted(settings()), source: reinforcement }); break;
    case 'source-report': sourceReport(); break;
    case 'again':
      if (report?.module === 'keyboard') void start({ module: 'keyboard', mode: 'practice', direction: report.direction, count: report.plannedQuestions });
      else if (report && report.mode !== 'reinforcement') startMain(report.mode, report.key, report.plannedQuestions, report.module);
      break;
    case 'again-reinforcement': reinforcement = structuredClone(report!.reinforcementSource!); navigate('review'); break;
    case 'retest-source': { const source = report!.reinforcementSource!; startMain('exam', source.examKey, source.examPlannedQuestions, 'notation'); break; }
    case 'retry-save': storage.retry(); render(false); break;
  }
});
app.addEventListener('input', event => {
  const target = event.target as HTMLInputElement;
  if (target.id !== 'volume') return;
  const value = Number(target.value);
  if (!Number.isFinite(value) || value < 0 || value > 100) return;
  storage.updateSettings({ ...settings(), volume: value / 100 });
  soundUpdated();
});
function soundUpdated() {
  setPianoVolume();
  if (active() && session && muted(settings())) session.markMuted();
  const label = app.querySelector('#sound-label');
  if (label) label.textContent = volumeLabel(settings());
  const value = app.querySelector('#volume-value');
  if (value) value.textContent = `${Math.round(settings().volume * 100)}%`;
  const mute = app.querySelector<HTMLInputElement>('#mute');
  if (mute) mute.checked = settings().muted;
  updateMutedNote();
  singing?.soundUpdated();
  if (!active() || !session) return;
  if (session.config.module === 'relative' && muted(settings())) {
    interrupt('相对音程需要声音。请取消静音并设置大于 0 的音量，再继续本题。');
    return;
  }
  if (muted(settings()) && session.phase === 'loading') {
    operation++;
    busy = false;
    session.ready(true);
    render();
  } else if (!muted(settings()) && piano.status !== 'ready' && !['loading', 'paused', 'audioError'].includes(session.phase)) {
    session.suspend();
    void resume();
  }
  syncPlaybackControls();
}
app.addEventListener('change', event => {
  const target = event.target as HTMLInputElement;
  if (target.id === 'mute') { storage.updateSettings({ ...settings(), muted: target.checked }); soundUpdated(); }
  if (target.id === 'key' && !active() && KEYS.some(k => k.id === target.value)) {
    updateModuleSettings({ key: target.value as KeyId });
    piano.stop();
    operation++;
    busy = false;
    if (page === 'learn') { render(false); app.querySelector<HTMLSelectElement>('#key')?.focus(); }
    else document.querySelector('#starting-note')!.textContent = `${exerciseModule === 'relative' ? '每题参考 do' : '本轮起始音'}：${keyInfo(moduleSettings().key).notes[0]}`;
  }
  if (target.name === 'count' && page === 'setup') {
    const count = Number(target.value);
    if (count !== 7 && count !== 21 && count !== 35) return;
    updateModuleSettings({ [setupMode === 'practice' ? 'practiceQuestionCount' : 'examQuestionCount']: count });
    document.querySelector<HTMLElement>('#small-sample')!.hidden = setupMode !== 'exam' || count !== 7;
  }
  if (page === 'keyboard-setup') {
    const keyboard = settings().modules.keyboard;
    if (target.name === 'keyboard-direction' && (target.value === 'name-to-key' || target.value === 'key-to-name')) {
      storage.updateSettings({ ...settings(), modules: { ...settings().modules, keyboard: { ...keyboard, direction: target.value } } });
    }
    const count = Number(target.value);
    if (target.name === 'keyboard-count' && (count === 12 || count === 24 || count === 36)) {
      storage.updateSettings({ ...settings(), modules: { ...settings().modules, keyboard: { ...keyboard, questionCount: count } } });
    }
  }
  if (target.name === 'pair' && page === 'result') {
    if (target.checked) selectedPairs.add(target.value); else selectedPairs.delete(target.value);
    document.querySelector('#selection-summary')!.textContent = `已选择 ${selectedPairs.size} 组。下一轮共 21 题。`;
    document.querySelector<HTMLElement>('#selection-hint')!.hidden = selectedPairs.size > 0;
    document.querySelector<HTMLButtonElement>('[data-action="reinforce"]')!.disabled = selectedPairs.size === 0;
  }
});
// Native button keyboard activation is the only submit/advance path. No digit shortcuts.
document.addEventListener('keydown', event => {
  if (event.repeat && (event.key === 'Enter' || event.key === ' ')
    && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLSelectElement)) event.preventDefault();
  if (event.key === 'Escape' && !document.querySelector('dialog')) {
    const details = document.querySelector<HTMLDetailsElement>('.sound-control[open]');
    if (details) { details.open = false; details.querySelector<HTMLElement>('summary')?.focus(); }
  }
});
document.addEventListener('pointerdown', event => {
  const target = event.target as Node;
  document.querySelectorAll<HTMLDetailsElement>('.sound-control[open]').forEach(control => {
    if (!control.contains(target)) control.open = false;
  });
});
function pauseForBackground() {
  piano.stop();
  singing?.interrupt();
  if (active()) interrupt();
  else {
    operation++;
    busy = false;
    const status = document.querySelector('#preview-status');
    if (status) status.textContent = '试听已暂停，点击音符继续。';
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseForBackground(); });
window.addEventListener('trainer:background', pauseForBackground);
piano.onInterruption = () => {
  if (muted(settings())) return;
  if (active()) interrupt('浏览器或系统中断了音频，请点击启用声音。');
  singing?.interrupt('浏览器或系统中断了音频，请点击启用声音。');
};
setPianoVolume();
render(false);

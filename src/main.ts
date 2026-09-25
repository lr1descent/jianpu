import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/views.css';
import { Piano } from './audio';
import { Session, type SessionConfig } from './session';
import { LocalStore } from './storage';
import { DEGREES, KEYS, keyInfo, pitch } from './music';
import { confusionPairs } from './confusion';
import { sourceSnapshot } from './reinforcement';
import { answerClass, escape, feedbackView, header, historyView, homeView, learnView, modeName, muted,
  nextLabel, quizView, resultView, reviewView, runningSummary, setupView, volumeLabel } from './views';
import type { Degree, KeyId, Mode, ReinforcementSource, SessionRecord, Solfege } from './types';

type Page = 'home' | 'setup' | 'quiz' | 'result' | 'learn' | 'history' | 'review';
const app = document.querySelector<HTMLDivElement>('#app')!;
// Accessing localStorage itself can fail in restricted browsing contexts.
const storage = new LocalStore({
  getItem: key => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: key => window.localStorage.removeItem(key),
});
const piano = new Piano();
let page: Page = 'home';
let setupMode: 'practice' | 'exam' = 'practice';
let session: Session | undefined;
let report: SessionRecord | undefined;
let reinforcement: ReinforcementSource | undefined;
let selectedPairs = new Set<string>();
let historyFilter: Mode | 'all' = 'all';
let operation = 0;
let busy = false;
const settings = () => storage.data.settings;
const active = () => page === 'quiz' && session?.phase !== 'result';
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

function focusPage() { app.querySelector<HTMLElement>('#question, h1')?.focus({ preventScroll: true }); }
function noticeView() {
  return storage.notice ? `<aside class="storage-notice" role="status"><p>${escape(storage.notice)}</p><button class="button secondary" data-action="retry-save">重试保存</button></aside>` : '';
}
function render(focus = true) {
  document.body.classList.toggle('is-quiz', page === 'quiz');
  const views: Record<Page, () => string> = {
    home: homeView, setup: () => setupView(setupMode, settings()), quiz: () => quizView(session!),
    learn: () => learnView(settings()), history: () => historyView(storage.data.sessions, historyFilter),
    review: () => reviewView(reinforcement!, settings()),
    result: () => resultView(report!, selectedPairs, storage.data.sessions.some(s => s.id === report?.reinforcementSource?.examId)),
  };
  app.innerHTML = `${header(settings(), page === 'quiz' ? session : undefined)}${noticeView()}${views[page]()}`;
  updateMutedNote();
  if (focus) focusPage();
}
function navigate(next: Page) {
  operation++;
  busy = false;
  piano.stop();
  page = next;
  render();
  window.scrollTo(0, 0);
}
function openReport(value: SessionRecord) {
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
function playQuestion() {
  if (!active() || !session || !['answering', 'practiceFeedback', 'examAnswerRecorded'].includes(session.phase)) return;
  try { piano.play(session.question.midi); }
  catch (error) { interrupt(message(error)); }
}
async function start(config: SessionConfig) {
  if (busy || active()) return;
  busy = true;
  const token = ++operation;
  piano.stop();
  setPianoVolume();
  session = new Session(config);
  page = 'quiz';
  render();
  window.scrollTo(0, 0);
  try {
    if (!muted(settings())) await piano.initialize();
    if (token !== operation || !session) return;
    if (session.ready()) { render(); playQuestion(); }
  } catch (error) { if (token === operation) interrupt(message(error)); }
  finally { if (token === operation) busy = false; }
}
function startMain(mode = setupMode, key = settings().key, count = mode === 'exam' ? settings().examQuestionCount : settings().practiceQuestionCount) {
  void start({ mode, key, count, muted: muted(settings()) });
}
function answer(selected: Solfege) {
  if (!active() || !session?.submit(selected, muted(settings()))) return;
  // Update the existing live region and controls in place; no layout or option reshuffle.
  app.querySelectorAll<HTMLButtonElement>('.answer').forEach(button => {
    button.disabled = true;
    button.className = `answer ${answerClass(session!, button.dataset.answer!)}`;
  });
  document.querySelector('#feedback')!.innerHTML = feedbackView(session);
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
  if (session.next()) { session.ready(); render(); playQuestion(); }
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
  showDialog(failed ? '声音需要恢复' : `${modeName(session.config.mode)}已暂停`,
    failed ? session.error : '本题和已提交的答案已保留。点击继续后恢复声音；中断前未作答的题目不计入速度统计。',
    [{ label: failed ? '重试 / 启用声音' : '继续', primary: true, run: () => { void resume(); } },
      ...(failed ? [{ label: '静音继续', run: () => { storage.updateSettings({ ...settings(), muted: true }); setPianoVolume(); session!.markMuted(); void resume(); } }] : []),
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
    const unanswered = !session.currentAnswer;
    session.resume();
    if (session.visiblePhase === 'answering' && !document.querySelector('#question')) render();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true }); else focusPage();
    soundUpdated();
    if (unanswered) playQuestion();
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
  const key = page === 'review' ? reinforcement!.examKey : settings().key;
  busy = true;
  const status = document.querySelector('#preview-status')!;
  status.textContent = '正在准备钢琴音色…';
  setPianoVolume();
  try {
    if (!muted(settings())) await piano.initialize();
    if (token !== operation) return;
    piano.play(pitch(key, degree).midi);
    status.textContent = muted(settings()) ? '当前已静音。可在声音设置中开启。' : `正在试听 ${degree} — ${trigger.querySelector('.note-mapping span')!.textContent}`;
  } catch (error) {
    if (token === operation) status.textContent = `${message(error)} 点击音符可重试。`;
  } finally { if (token === operation) busy = false; }
}
function chooseReinforcement() {
  if (!report?.answers || report.mode !== 'exam' || !selectedPairs.size) return;
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
  if (active() && !['answer', 'next', 'replay', 'end', 'retry-save'].includes(action!)) return;
  switch (action) {
    case 'home': navigate('home'); break;
    case 'learn': navigate('learn'); break;
    case 'history': navigate('history'); break;
    case 'setup-practice': case 'setup-exam':
      setupMode = action === 'setup-practice' ? 'practice' : 'exam';
      storage.updateSettings({ ...settings(), lastMainMode: setupMode });
      navigate('setup'); break;
    case 'start': startMain(); break;
    case 'answer': answer(target.dataset.answer as Solfege); break;
    case 'next': next(); break;
    case 'replay': if (session?.replay()) playQuestion(); break;
    case 'end': confirmEnd(); break;
    case 'preview': void preview(Number(target.dataset.degree) as Degree, target); break;
    case 'open-report': { const found = storage.data.sessions.find(s => s.id === target.dataset.id); if (found) openReport(found); break; }
    case 'filter': historyFilter = target.dataset.filter as Mode | 'all'; render(false); app.querySelector<HTMLButtonElement>(`[data-filter="${historyFilter}"]`)?.focus(); break;
    case 'clear-history': showDialog('清空历史记录？', '将删除本应用保存的所有练习、考试与强化记录。声音和练习设置会保留。',
      [{ label: '取消', run: () => {} }, { label: '确认清空', run: () => { storage.clearHistory(); render(); } }], () => {}); break;
    case 'reinforce': chooseReinforcement(); break;
    case 'start-reinforcement': if (reinforcement) void start({ mode: 'reinforcement', key: reinforcement.examKey, count: 21, muted: muted(settings()), source: reinforcement }); break;
    case 'source-report': sourceReport(); break;
    case 'again': if (report && report.mode !== 'reinforcement') startMain(report.mode, report.key, report.plannedQuestions); break;
    case 'again-reinforcement': reinforcement = structuredClone(report!.reinforcementSource!); navigate('review'); break;
    case 'retest-source': { const source = report!.reinforcementSource!; startMain('exam', source.examKey, source.examPlannedQuestions); break; }
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
  if (active() && muted(settings())) session!.markMuted();
  const label = app.querySelector('#sound-label');
  if (label) label.textContent = volumeLabel(settings());
  const value = app.querySelector('#volume-value');
  if (value) value.textContent = `${Math.round(settings().volume * 100)}%`;
  const mute = app.querySelector<HTMLInputElement>('#mute');
  if (mute) mute.checked = settings().muted;
  updateMutedNote();
  if (!active() || !session) return;
  if (muted(settings()) && session.phase === 'loading') {
    operation++;
    busy = false;
    session.ready();
    render();
  } else if (!muted(settings()) && piano.status !== 'ready' && !['loading', 'paused', 'audioError'].includes(session.phase)) {
    session.suspend();
    void resume();
  }
}
app.addEventListener('change', event => {
  const target = event.target as HTMLInputElement;
  if (target.id === 'mute') { storage.updateSettings({ ...settings(), muted: target.checked }); soundUpdated(); }
  if (target.id === 'key' && !active() && KEYS.some(k => k.id === target.value)) {
    storage.updateSettings({ ...settings(), key: target.value as KeyId });
    piano.stop();
    operation++;
    busy = false;
    if (page === 'learn') { render(false); app.querySelector<HTMLSelectElement>('#key')?.focus(); }
    else document.querySelector('#starting-note')!.textContent = `本轮起始音：${keyInfo(settings().key).notes[0]}`;
  }
  if (target.name === 'count' && page === 'setup') {
    const count = Number(target.value);
    if (count !== 7 && count !== 21 && count !== 35) return;
    storage.updateSettings({ ...settings(), [setupMode === 'practice' ? 'practiceQuestionCount' : 'examQuestionCount']: count });
    document.querySelector<HTMLElement>('#small-sample')!.hidden = setupMode !== 'exam' || count !== 7;
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
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  piano.stop();
  if (active()) interrupt();
  else {
    operation++;
    busy = false;
    const status = document.querySelector('#preview-status');
    if (status) status.textContent = '试听已暂停，点击音符继续。';
  }
});
piano.onInterruption = () => { if (active() && !muted(settings())) interrupt('浏览器或系统中断了音频，请点击启用声音。'); };
setPianoVolume();
render(false);

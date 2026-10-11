import { KEYBOARD_COUNTS, KEYBOARD_NOTES, keyboardDirectionName, keyboardKeyPosition, keyboardNoteName } from './keyboard';
import { accuracy } from './statistics';
import { button, dateLabel, escape, nextLabel, runningSummary, soundControl } from './views';
import type { KeyboardSession } from './keyboard-session';
import type { KeyboardSessionRecord, KeyboardSettings, Settings } from './types';

export function keyboardSetupView(settings: KeyboardSettings, sound: Pick<Settings, 'volume' | 'muted'>) {
  return `<main class="page reading keyboard-setup" id="main">${button('home', '← 返回首页', 'plain back')}
    <div class="page-heading"><h1 tabindex="-1">钢琴键盘音位识别</h1><p class="secondary-text" lang="en">Keyboard Note Identification</p><p>把音名和琴键位置联系起来，两个方向分开练。</p></div>
    <div class="settings-surface"><fieldset class="keyboard-directions"><legend>练习方向</legend>
      <label class="direction-choice"><input type="radio" name="keyboard-direction" value="name-to-key" ${settings.direction === 'name-to-key' ? 'checked' : ''} /><span><strong>音名 → 琴键</strong><span class="secondary-text">给出 F♯，点击对应琴键。看见音名，立即定位。</span></span></label>
      <label class="direction-choice"><input type="radio" name="keyboard-direction" value="key-to-name" ${settings.direction === 'key-to-name' ? 'checked' : ''} /><span><strong>琴键 → 音名</strong><span class="secondary-text">标出一个琴键，选择它的音名。看见琴键，立即命名。</span></span></label>
    </fieldset><fieldset><legend>本轮题数</legend><div class="segmented">${KEYBOARD_COUNTS.map(count => `<label><input type="radio" name="keyboard-count" value="${count}" ${count === settings.questionCount ? 'checked' : ''} /><span>${count} 题</span></label>`).join('')}</div></fieldset>
    <p class="field-hint">一个八度，从左至右 C–B：7 个白键、5 个黑键。每 12 题覆盖全部琴键。</p>
    <p class="field-hint">黑键的升号与降号音名指向同一琴键，例如 A♯ / B♭。声音使用 C4–B4 的钢琴采样：琴键 → 音名出题时播放；音名 → 琴键作答后播放正确音。</p>
    <div class="setting-sound"><span>声音设置</span>${soundControl(sound)}</div></div>
    <div class="setup-start">${button('start-keyboard', '开始键盘练习', 'primary wide')}<p class="field-hint">首次作答后显示正确对应。刷新会结束进行中的轮次。</p></div></main>`;
}
export function keyboardAnswerClass(session: KeyboardSession, option: number) {
  if (!session.currentAnswer) return '';
  if (option === session.question.pitchClass) return 'correct';
  return option === session.currentAnswer.selected ? 'incorrect' : '';
}
export function pianoKeyboardView(session: KeyboardSession) {
  const identify = session.config.direction === 'key-to-name';
  const answer = session.currentAnswer;
  const label = identify ? `一个八度的钢琴键盘，标记的是${keyboardKeyPosition(session.question.pitchClass)}` : '选择琴键，一个八度从 C 到 B';
  return `<div class="piano-keyboard" role="${identify ? 'img' : 'group'}" aria-label="${label}">${KEYBOARD_NOTES.map(note => {
    const black = note.whitePosition === null;
    const state = keyboardAnswerClass(session, note.pitchClass);
    const target = identify && note.pitchClass === session.question.pitchClass;
    const tag = identify ? 'div' : 'button';
    const mark = state === 'correct' ? '✓' : state === 'incorrect' ? '×' : target ? '?' : '';
    const attrs = identify ? '' : `type="button" data-action="answer-keyboard" data-pitch="${note.pitchClass}" aria-label="${keyboardKeyPosition(note.pitchClass)}${answer ? `，${keyboardNoteName(note.pitchClass)}` : ''}" ${session.phase !== 'answering' ? 'disabled' : ''}`;
    return `<${tag} class="piano-key ${black ? 'black-key' : 'white-key'} ${state}${target ? ' target-key' : ''}" style="--key-position:${black ? note.blackPosition : note.whitePosition}" ${attrs}>
      <span class="key-mark" aria-hidden="true">${mark}</span>${answer ? `<span class="key-name" aria-hidden="true">${note.names[0]}</span>` : ''}</${tag}>`;
  }).join('')}</div>`;
}
export function keyboardFeedbackView(session: KeyboardSession) {
  const answer = session.currentAnswer;
  if (!answer) return '';
  const correct = keyboardNoteName(session.question.pitchClass);
  return `<p class="${answer.correct ? 'success-text' : 'error-text'}">${answer.correct ? `正确，${correct}。` : `你选择了 ${keyboardNoteName(answer.selected)}；正确答案是 ${correct}。`}</p>
    <p class="secondary-text">${correct}：${keyboardKeyPosition(session.question.pitchClass)}。${correct.includes('/') ? '两个音名对应同一个琴键。' : ''}</p>`;
}
export function keyboardPlaybackStatus(session: KeyboardSession, muted: boolean) {
  if (muted) return '当前已静音，可继续练习。';
  if (session.visiblePhase === 'loading') return '正在准备钢琴音色…';
  if (session.visiblePhase === 'listening') return session.currentAnswer ? '正在播放正确琴键音…' : '正在播放标记的琴键音…';
  if (session.currentAnswer) return '可继续下一题。';
  return session.config.direction === 'key-to-name' ? '播放完成，请选择音名。' : '选择琴键后播放正确音。';
}
export function keyboardQuizView(session: KeyboardSession, muted: boolean) {
  const identify = session.config.direction === 'key-to-name';
  return `<main class="page quiz keyboard-quiz" id="main"><div class="quiz-meta"><span>${keyboardDirectionName(session.config.direction)} · C–B</span><span id="question-progress">第 ${session.index + 1} / ${session.questions.length} 题</span></div>
    <progress class="quiz-progress" max="${session.questions.length}" value="${session.answers.length}" aria-label="已答题目"></progress>
    <div class="keyboard-question"><h1 id="question" class="${identify ? '' : 'keyboard-prompt'}" tabindex="-1">${identify ? '标记的琴键叫什么？' : session.question.promptName}</h1><p class="secondary-text">${identify ? '找出带 ? 标记的琴键，选择它的音名。' : '在下方键盘上，点击这个音名对应的琴键。'}</p><p id="playback-status" class="secondary-text" role="status">${keyboardPlaybackStatus(session, muted)}</p></div>
    <div id="keyboard-stage">${pianoKeyboardView(session)}</div>
    ${identify ? `<div class="keyboard-note-options" role="group" aria-label="选择音名">${session.question.options.map(option => `<button type="button" class="answer ${keyboardAnswerClass(session, option)}" data-action="answer-keyboard" data-pitch="${option}" ${session.phase !== 'answering' ? 'disabled' : ''}>${keyboardNoteName(option)}</button>`).join('')}</div>` : ''}
    <div class="feedback" id="feedback" role="status" aria-live="polite" aria-atomic="true">${keyboardFeedbackView(session)}</div>
    <div class="next-row">${button('next', nextLabel(session), 'primary next', session.currentAnswer && session.phase !== 'listening' ? '' : 'disabled')}</div>
    <div class="quiz-footer"><span id="running-summary" class="secondary-text">${runningSummary(session)}</span><div>${button('pause', '暂停', 'plain')}${button('end', '结束本轮', 'plain')}</div></div>
    <p class="quiz-hint">按 Tab 切换${identify ? '音名' : '琴键'}，按空格或 Enter 作答。每题只记录首次答案。<span id="muted-note"></span></p></main>`;
}
export function keyboardResultView(report: KeyboardSessionRecord) {
  const summary = report.summary;
  const list = (answers: typeof report.answers) => `<ol class="answer-records">${answers.map(a => `<li><span>第 ${a.questionIndex + 1} 题 · <strong>${report.direction === 'name-to-key' ? escape(a.promptName) : keyboardKeyPosition(a.pitchClass)}</strong></span><span>选择 ${keyboardNoteName(a.selected)} · 正确音名 ${keyboardNoteName(a.pitchClass)}<span class="record-note secondary-text">${a.correct ? '正确' : '错误'} · ${a.reactionMs === null ? '耗时无效（中断）' : `${(a.reactionMs / 1000).toFixed(2)} 秒`}</span></span></li>`).join('')}</ol>`;
  const wrong = report.answers.filter(a => !a.correct);
  return `<main class="page reading report" id="main">${button('history', '← 历史记录', 'plain back')}<div class="page-heading"><h1 tabindex="-1">键盘练习小结</h1><p class="secondary-text">钢琴键盘音位识别 · ${keyboardDirectionName(report.direction)} · ${dateLabel(report.endedAt)}</p></div>
    <section class="score-section" aria-label="本轮成绩"><p class="score-label">${summary.answered ? '正确率' : '暂无作答'}</p><div class="score-line"><strong class="score">${accuracy(summary.correct, summary.answered)}</strong><span class="completion">${report.endedEarly ? '提前结束 · 部分完成' : '本轮已完成'}</span></div><p>已答 ${summary.answered} / ${report.plannedQuestions} · 正确 ${summary.correct} · 错误 ${summary.wrong}</p>
    <dl class="report-facts"><div><dt>正确题操作耗时中位数</dt><dd>${summary.medianCorrectReactionMs === null ? '—' : `${(summary.medianCorrectReactionMs / 1000).toFixed(2)} 秒`}</dd></div></dl>
    <p class="field-hint">耗时包含识别、寻找琴键或音名和点击；只统计首次答对且未中断的题目。两个方向分别记录，不合并比较速度。</p></section>
    <section class="report-section"><h2>本轮明细</h2><details class="report-details"><summary>逐音名统计</summary><div class="table-scroll"><table><thead><tr><th>音名</th><th>已答</th><th>正确</th><th>错误</th></tr></thead><tbody>${KEYBOARD_NOTES.map(n => { const stats = summary.perPitch[n.pitchClass]; return `<tr><th>${keyboardNoteName(n.pitchClass)}</th><td>${stats.answered}</td><td>${stats.correct}</td><td>${stats.wrong}</td></tr>`; }).join('')}</tbody></table></div></details>
    <details class="report-details"><summary>错题记录（${wrong.length}）</summary>${wrong.length ? list(wrong) : '<p>本轮没有错题记录。</p>'}</details>
    <details class="report-details"><summary>全部逐题记录（${report.answers.length}）</summary>${list(report.answers)}</details></section>
    <div class="actions report-actions">${button('again', '同设置再练')}${button('keyboard-module', '更换练习方向')}${button('home', '返回首页')}</div></main>`;
}

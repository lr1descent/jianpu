import { DEGREES, KEYS, keyInfo, solfege } from './music';
import { accuracy, summarize } from './statistics';
import { confusionMatrix, confusionPairs } from './confusion';
import type { Session } from './session';
import type { ConfusionPair, Degree, Mode, ReinforcementSource, SessionRecord, Settings } from './types';

export const escape = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const modeName = (mode: Mode) => ({ practice: '练习', exam: '考试', reinforcement: '强化练习' }[mode]);
export const dateLabel = (value: string) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date(value));
const button = (action: string, label: string, style = 'secondary', attrs = '') => `<button type="button" class="button ${style}" data-action="${action}" ${attrs}>${label}</button>`;
export const keySelect = (value: Settings['key']) => `<div class="field"><label for="key">调性</label><select id="key" name="key">${KEYS.map(k => `<option value="${k.id}" ${k.id === value ? 'selected' : ''}>${k.label} 大调（1=${k.label}）</option>`).join('')}</select></div>`;
export const muted = (settings: Settings) => settings.muted || settings.volume === 0;
export const volumeLabel = (settings: Settings) => settings.muted ? '已静音' : settings.volume === 0 ? '音量 0% · 已静音' : `音量 ${Math.round(settings.volume * 100)}%`;

export function soundControl(settings: Settings) {
  return `<details class="sound-control"><summary id="sound-label">${volumeLabel(settings)}</summary>
    <div class="sound-panel"><label for="volume">音量 <output id="volume-value">${Math.round(settings.volume * 100)}%</output></label>
      <input type="range" id="volume" min="0" max="100" value="${Math.round(settings.volume * 100)}" />
      <label class="check-row"><input id="mute" type="checkbox" ${settings.muted ? 'checked' : ''} />静音</label>
    </div></details>`;
}
export function header(settings: Settings, session?: Session) {
  return `<header class="site-header"><div class="header-inner">
    ${session ? `<span class="brand">简谱唱名 <span class="brand-mode">· ${modeName(session.config.mode)}</span></span>` : button('home', '简谱唱名', 'brand plain')}
    ${session ? soundControl(settings) : `<nav aria-label="主导航">${button('learn', '认识音符', 'plain')}${button('history', '历史记录', 'plain')}</nav>`}
    </div></header>`;
}
export function homeView() {
  return `<main class="home page" id="main"><div class="home-intro"><h1 tabindex="-1">从一个音开始。</h1><p>看数字，听钢琴，选唱名。</p></div>
    <div class="mode-grid">
      <button class="mode-card" data-action="setup-practice"><span class="mode-title">练习模式</span><span class="secondary-text">每题即时反馈，慢慢建立联系。</span><span class="card-link">进入练习 <span aria-hidden="true">→</span></span></button>
      <button class="mode-card" data-action="setup-exam"><span class="mode-title">考试模式</span><span class="secondary-text">交卷后查看结果，了解本轮表现。</span><span class="card-link">进入考试 <span aria-hidden="true">→</span></span></button>
    </div><p class="home-note">按自己的节奏来。没有倒计时，也不需要音乐基础。</p>
    <footer class="local-note">记录保存在本机 · 声音使用本地钢琴采样</footer></main>`;
}
export function setupView(mode: 'practice' | 'exam', settings: Settings) {
  const count = mode === 'practice' ? settings.practiceQuestionCount : settings.examQuestionCount;
  return `<main class="page narrow" id="main">${button('home', '← 返回首页', 'plain back')}
    <div class="page-heading"><h1 tabindex="-1">${modeName(mode)}模式</h1><p class="secondary-text">${mode === 'practice' ? '选择唱名后，立即查看正确对应。' : '专注作答。对错与成绩将在交卷后一起揭晓。'}</p></div>
    <div class="settings-surface">${keySelect(settings.key)}<p class="field-hint" id="starting-note">本轮起始音：${keyInfo(settings.key).notes[0]}</p>
      <fieldset><legend>本轮题数</legend><div class="segmented count-options">${[7, 21, 35].map(n => `<label><input type="radio" name="count" value="${n}" ${n === count ? 'checked' : ''} /><span>${n} 题</span></label>`).join('')}</div></fieldset>
      <p id="small-sample" class="field-hint" ${mode === 'exam' && count === 7 ? '' : 'hidden'}>小样本自测，每个数字仅出现一次，不能据此判断稳定掌握程度。</p>
      <div class="setting-sound"><span>声音设置</span>${soundControl(settings)}</div>
    </div><div class="setup-start">${button('start', `开始${modeName(mode)}`, 'primary wide')}<p class="field-hint">进行中的轮次刷新后不会保留。<br />开始后，调性和题数保持不变。</p></div></main>`;
}
export function noteCards(key: Settings['key'], degrees: Degree[]) {
  return `<div class="note-grid">${degrees.map(d => `<button class="note-card" data-action="preview" data-degree="${d}" aria-label="试听 ${d}，${solfege(d)}，${keyInfo(key).notes[d - 1]}"><span class="note-mapping"><strong>${d}</strong><span>${solfege(d)}</span></span><span class="secondary-text">${keyInfo(key).notes[d - 1]}</span></button>`).join('')}</div>`;
}
export function learnView(settings: Settings) {
  return `<main class="page reading" id="main">${button('home', '← 返回首页', 'plain back')}<div class="page-heading"><h1 tabindex="-1">认识音符</h1><p class="secondary-text">点击一个音，听听它在当前调中的声音。</p></div>
    <div class="learn-settings">${keySelect(settings.key)}${soundControl(settings)}</div>${noteCards(settings.key, DEGREES)}
    <p class="secondary-text">换调改变实际音高，数字与唱名的对应始终不变。<br />这里可以自由试听，不计分。</p><p id="preview-status" role="status"></p></main>`;
}
export function reviewView(source: ReinforcementSource, settings: Settings) {
  return `<main class="page reading" id="main">${button('source-report', '← 返回考试报告', 'plain back')}<div class="page-heading"><h1 tabindex="-1">先认一认，再练一练。</h1><p class="secondary-text">${keyInfo(source.examKey).label} 大调 · 本轮强化 21 题</p></div>
    <div class="section-heading"><h2>这些数字的正确唱名</h2>${soundControl(settings)}</div>${noteCards(source.examKey, source.targetDegrees)}
    <p class="secondary-text">可以点击试听，也可以直接开始，不必逐张试听。</p><p id="preview-status" role="status"></p>
    <div class="actions">${button('start-reinforcement', '开始答题', 'primary')}${button('source-report', '返回报告')}</div></main>`;
}
export function feedbackView(session: Session) {
  const answer = session.currentAnswer;
  if (!answer) return '';
  if (session.config.mode === 'exam') return '<p>答案已记录，请继续下一题。</p>';
  const q = session.question;
  return `<p class="${answer.correct ? 'success-text' : 'error-text'}">${answer.correct ? `正确，${q.degree} = ${q.correctAnswer}。` : `你选择了 ${answer.selected}；正确答案是 ${q.correctAnswer}。${q.degree} = ${q.correctAnswer}。`}</p><p class="secondary-text">${keyInfo(q.key).label} 大调中的实际音：${q.displayNote}</p>`;
}
export function answerClass(session: Session, option: string) {
  const answer = session.currentAnswer;
  if (!answer) return '';
  if (session.config.mode === 'exam') return option === answer.selected ? 'selected' : '';
  if (option === session.question.correctAnswer) return 'correct';
  return option === answer.selected ? 'incorrect' : '';
}
export function nextLabel(session: Session) {
  return session.index < session.questions.length - 1 ? '下一题' : ({ practice: '查看练习小结', exam: '交卷并查看报告', reinforcement: '查看强化小结' }[session.config.mode]);
}
export function quizView(session: Session) {
  const q = session.question;
  const loading = session.visiblePhase === 'loading';
  const locked = session.phase !== 'answering';
  const info = keyInfo(q.key);
  return `<main class="page quiz" id="main"><div class="quiz-meta"><span>${info.label} 大调 · 1=${info.label}</span><span id="question-progress">第 ${q.index + 1} / ${session.questions.length} 题</span></div>
    <progress class="quiz-progress" max="${session.questions.length}" value="${session.answers.length}" aria-label="已答题目"></progress>
    ${loading ? `<div class="loading-stage" role="status"><h1 tabindex="-1">正在准备钢琴音色…</h1><p class="secondary-text">准备完成后再开始答题与计时。</p></div>` : `<div class="question-stage"><h1 id="question" class="question-number" tabindex="-1" aria-label="简谱数字 ${q.degree}">${q.degree}</h1></div>
      <div class="replay-row">${button('replay', '重听', 'replay')}</div>
      <div class="answers" role="group" aria-label="选择唱名">${q.options.map(option => `<button class="answer ${answerClass(session, option)}" data-action="answer" data-answer="${option}" ${locked ? 'disabled' : ''}>${option}</button>`).join('')}</div>
      <div class="feedback" id="feedback" role="status" aria-live="polite" aria-atomic="true">${feedbackView(session)}</div>
      <div class="next-row">${button('next', nextLabel(session), 'primary next', session.currentAnswer ? '' : 'disabled')}</div>`}
    <div class="quiz-footer"><span id="running-summary" class="secondary-text">${runningSummary(session)}</span>${button('end', session.config.mode === 'exam' ? '提前交卷' : '结束本轮', 'plain')}</div>
    <p class="quiz-hint">${loading ? '采样从本地加载。' : '按 Tab 切换选项，按空格或 Enter 选择。'}<span id="muted-note"></span></p></main>`;
}
export function runningSummary(session: Session) {
  return `已答 ${session.answers.length} 题${session.config.mode === 'exam' ? '' : ` · 正确 ${session.answers.filter(a => a.correct).length} 题`}`;
}
function directionText(pair: ConfusionPair, report: SessionRecord) {
  return [[pair.a, pair.b, pair.aToB], [pair.b, pair.a, pair.bToA]].map(([from, to, n]) => n
    ? `本次看到 ${from} 时，${n} 次选成 ${solfege(to as Degree)}。`
    : report.summary.perDegree[from as Degree].answered ? `看到 ${from} 时未选成 ${solfege(to as Degree)}，该方向未发生错误。` : `${from} 的作答样本为 0，该方向没有记录。`).join('<br />');
}
export function confusionView(report: SessionRecord, selected: Set<string>) {
  if (!report.answers) return '<p class="secondary-text">旧版记录没有保存具体选项，无法分析混淆方向。</p>';
  if (!report.answers.length) return '';
  const pairs = confusionPairs(report.answers);
  if (!pairs.length) return '<section class="report-section"><h2>本次未发现错选项</h2><p class="secondary-text">这是本轮的观察，可以按自己的节奏继续练习。</p></section>';
  return `<section class="report-section" id="reinforcement"><h2>可以对照巩固</h2><p class="secondary-text">仅依据本轮错选，选择你想复习的组。</p>
    <div class="confusion-list">${pairs.map(p => `<label class="confusion-row"><input type="checkbox" name="pair" value="${p.a}-${p.b}" ${selected.has(`${p.a}-${p.b}`) ? 'checked' : ''} /><span><span class="pair-mapping">${p.a} — ${solfege(p.a)} <span class="secondary-text">/</span> ${p.b} — ${solfege(p.b)}</span><span class="direction secondary-text">${directionText(p, report)}</span><span class="evidence">${p.total > 1 ? '本次重复混淆' : '本次单次错误，可复习'}</span></span></label>`).join('')}</div>
    <p class="selection-summary" id="selection-summary">已选择 ${selected.size} 组。下一轮共 21 题。</p><p id="selection-hint" class="field-hint" ${selected.size ? 'hidden' : ''}>请至少选择一组。</p>
    <div class="actions">${button('reinforce', '开始所选项强化', 'primary', selected.size ? '' : 'disabled')}${button('home', '暂不强化')}</div></section>`;
}
function perDegreeView(report: SessionRecord) {
  return `<details class="report-details"><summary>逐数字统计</summary><div class="table-scroll"><table><thead><tr><th>数字 / 唱名</th><th>已答</th><th>正确</th><th>错误</th><th>错误率</th></tr></thead><tbody>${DEGREES.map(d => {
    const stats = report.summary.perDegree[d];
    return `<tr><th>${d} / ${solfege(d)}</th><td>${stats.answered}</td><td>${stats.correct}</td><td>${stats.wrong}</td><td>${stats.answered ? accuracy(stats.wrong, stats.answered) : '无样本'}</td></tr>`;
  }).join('')}</tbody></table></div></details>`;
}
function answerDetails(report: SessionRecord) {
  if (!report.answers) return '';
  const wrong = report.answers.filter(a => !a.correct);
  const list = (answers: typeof report.answers) => `<ol class="answer-records">${answers.map(a => `<li><span>第 ${a.questionIndex + 1} 题 · <strong>${a.degree}</strong></span><span>选择 ${a.selected} · 正确唱名 ${solfege(a.degree)}<span class="record-note secondary-text">${a.displayNote} · ${a.correct ? '正确' : '错误'} · ${a.reactionMs === null ? '耗时无效（中断）' : `${(a.reactionMs / 1000).toFixed(2)} 秒`} · 重听 ${a.replaysBeforeAnswer + a.replaysAfterAnswer} 次${a.mutedAtAnswer ? ' · 作答时静音' : ''}</span></span></li>`).join('')}</ol>`;
  const matrix = confusionMatrix(report.answers);
  return `<details class="report-details"><summary>错题记录（${wrong.length}）</summary>${wrong.length ? list(wrong) : '<p>本轮没有错题记录。</p>'}</details>
    <details class="report-details"><summary>全部逐题记录（${report.answers.length}）</summary>${list(report.answers)}</details>
    ${report.mode === 'exam' ? `<details class="report-details"><summary>混淆矩阵</summary><p class="field-hint">行是题目数字，列是实际选择的唱名；格内为次数。</p><div class="table-scroll"><table class="matrix"><thead><tr><th>数字 / 所选</th>${DEGREES.map(d => `<th>${solfege(d)}</th>`).join('')}</tr></thead><tbody>${DEGREES.map((d, i) => `<tr><th>${d}</th>${matrix[i].map(n => `<td class="${n ? 'has-count' : ''}">${n}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>` : ''}`;
}
export function resultView(report: SessionRecord, selected: Set<string>, sourceExists: boolean) {
  const summary = report.summary, source = report.mode === 'reinforcement' ? report.reinforcementSource : undefined;
  const replays = report.answers?.reduce((sum, a) => sum + a.replaysBeforeAnswer + a.replaysAfterAnswer, 0);
  return `<main class="page reading report" id="main">${button('history', '← 历史记录', 'plain back')}<div class="page-heading"><h1 tabindex="-1">${report.mode === 'exam' ? '考试报告' : `${modeName(report.mode)}小结`}</h1><p class="secondary-text">${keyInfo(report.key).label} 大调 · ${dateLabel(report.endedAt)}${report.legacySummaryOnly ? ' · 旧版摘要记录' : ''}</p></div>
    <section class="score-section" aria-label="本轮成绩"><p class="score-label">${summary.answered ? '正确率' : '暂无作答'}</p><div class="score-line"><strong class="score">${accuracy(summary.correct, summary.answered)}</strong><span class="completion">${report.endedEarly ? '提前结束 · 部分完成' : '本轮已完成'}</span></div><p>已答 ${summary.answered} / ${report.plannedQuestions} · 正确 ${summary.correct} · 错误 ${summary.wrong}</p>
    <dl class="report-facts"><div><dt>正确题操作耗时中位数</dt><dd>${summary.medianCorrectReactionMs === null ? '—' : `${(summary.medianCorrectReactionMs / 1000).toFixed(2)} 秒`}</dd></div><div><dt>重听</dt><dd>${replays === undefined ? '未知' : `${replays} 次`}</dd></div><div><dt>声音与中断</dt><dd>${report.audioEverMuted === null ? '旧版未记录' : `${report.audioEverMuted ? '曾静音' : '未静音'} · ${report.audioEverInterrupted ? '曾中断' : '未中断'}`}</dd></div></dl>
    <p class="field-hint">耗时包含识读、寻找选项和点击；只统计答对且未中断的题目。</p>${report.mode === 'exam' && report.plannedQuestions === 7 ? '<p class="field-hint">小样本自测，每个数字仅出现一次，不能据此判断稳定掌握程度。</p>' : ''}</section>
    ${report.mode === 'exam' ? confusionView(report, selected) : ''}
    ${source ? reinforcementSummary(report, source, sourceExists) : ''}
    ${report.legacySummaryOnly ? '<p class="notice">旧版记录没有保存具体选项，保留原摘要；无法还原错选或生成强化。</p>' : ''}
    <section class="report-section"><h2>本轮明细</h2>${perDegreeView(report)}${answerDetails(report)}</section>
    <div class="actions report-actions">${source ? `${button('again-reinforcement', '按原选项再强化一轮')}${button('source-report', '返回原考试报告', 'secondary', sourceExists ? '' : 'disabled')}${button('retest-source', '按来源考试设置重新考试')}` : button('again', report.mode === 'exam' ? '同设置重新考试' : '同设置再练')}${button('home', '返回首页')}</div></main>`;
}
function reinforcementSummary(report: SessionRecord, source: ReinforcementSource, sourceExists: boolean) {
  const targets = summarize(report.answers!.filter(a => source.targetDegrees.includes(a.degree)));
  const pairs = confusionPairs(report.answers!);
  return `<section class="report-section"><h2>目标项表现</h2><p>目标数字：${source.targetDegrees.join('、')}</p><p>已答 ${targets.answered} · 正确 ${targets.correct} · 错误 ${targets.wrong} · 正确率 ${accuracy(targets.correct, targets.answered)}</p><p class="secondary-text">全部题目统计见上方。本轮即时反馈、目标加密，不能据此直接推断相较考试的能力提升。</p>
    <p class="field-hint">来源考试：${dateLabel(source.examEndedAt)} · ${keyInfo(source.examKey).label} 大调 · 已答 ${source.examAnswered} / ${source.examPlannedQuestions} · 正确 ${source.examCorrect}</p>${sourceExists ? '' : '<p class="notice">来源报告已不在本地。强化小结和来源摘要仍然保留。</p>'}
    <h3>本轮错选方向</h3>${pairs.length ? pairs.map(p => `<p class="secondary-text">${directionText(p, report)}</p>`).join('') : '<p class="secondary-text">本次未发现错选项。</p>'}</section>`;
}
export function historyView(sessions: SessionRecord[], filter: Mode | 'all') {
  const filtered = sessions.filter(s => filter === 'all' || s.mode === filter);
  return `<main class="page reading" id="main">${button('home', '← 返回首页', 'plain back')}<div class="section-heading page-heading"><h1 tabindex="-1">历史记录</h1>${sessions.length ? button('clear-history', '清空历史', 'plain') : ''}</div>
    <div class="segmented history-filter" role="group" aria-label="筛选模式">${(['all', 'practice', 'exam', 'reinforcement'] as const).map(mode => `<button data-action="filter" data-filter="${mode}" aria-pressed="${filter === mode}">${mode === 'all' ? '全部' : modeName(mode)}</button>`).join('')}</div>
    ${filtered.length ? `<div class="history-list">${filtered.map(s => `<button class="history-row" data-action="open-report" data-id="${escape(s.id)}"><span><strong>${modeName(s.mode)} · ${keyInfo(s.key).label} 大调</strong><span class="secondary-text">${dateLabel(s.endedAt)} · ${s.endedEarly ? '部分完成' : '已完成'}${s.legacySummaryOnly ? ' · 旧版摘要' : ''}</span></span><span class="history-count">正确 ${s.summary.correct} / 已答 ${s.summary.answered}<span aria-hidden="true"> →</span></span></button>`).join('')}</div>` : `<div class="empty-state"><p>${sessions.length ? '此模式还没有记录。' : '还没有记录。完成一轮后会保存在这里。'}</p>${button('home', '返回首页')}</div>`}
    <p class="field-hint">最近 100 轮保存在本机，不在设备间同步。清理本地存储数据可能影响保留。</p></main>`;
}

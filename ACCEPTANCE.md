# v1.2 实际验收记录

日期：2026-09-25。实现依据：完整需求第 12 节、第 15 节。截图来自本地运行的真实应用，不是设计效果图；截图中的报告由独立测试上下文作答产生，不写入用户日常历史。

## 已执行

| 项目 | 实际结果 |
| --- | --- |
| `npm run test` | 23 / 23 通过（领域、状态、存储 18；音频 3；对比度 2） |
| `npm run typecheck` | 通过 |
| `npm run build` | 通过，包含本地 MP3，未使用外部运行期资源 |
| `npm run test:browser` | Google Chrome，15 / 15 通过；独立临时测试上下文 |
| Chrome 可视窗口 | 实际查看首页、设置、采样加载及答题页；未宣称听验 |
| Safari 可视窗口 | 本地页面加载、采样就绪、选择答案、反馈、后台暂停恢复；通过原生缩放菜单明确设置为 200%，实际推进到第 2 题；恢复 100% |
| Playwright WebKit / 真实手机 / VoiceOver | 未执行；桌面 Chrome 小屏模拟不等同真机 |
| 扬声器人工听验 | 未执行；音色辨识、实际发声和主观爆音仍需人工验收 |

## 第 12.5 节逐项结果

| 编号 | 验证方式与结果 |
| --- | --- |
| E01–E02 | 首页截图与 DOM：浅色、系统字体、蓝色操作；练习/考试独立等权入口，整张卡为一个语义按钮，无嵌套按钮 |
| E03–E04 | 实际答题数字 128px（低高度 96px），选项等尺寸；设置有十二调与三档题数，进入本轮后无可切换设置 |
| E05–E06 | 算法/浏览器验证七项唯一、DOM 顺序一致；重听不改变顺序，数字键不答题，新题聚焦数字标题 |
| E07–E09 | 首次反馈锁定；考试答对/答错只显示同一段中性文案，无 correct/incorrect 样式或答案解释；各视口普通错误反馈前后下一题纵坐标相同 |
| E10–E12 | 报告只有一项大字号正确率并标完成条件，详情可展开；实际运行 35 题示例得 32 对 / 3 错 / 91.4%；勾选组可全部取消，开始禁用但离开可用；主动进入强化 |
| E13 | 已测全对、零作答、采样加载失败后重试、主动静音后恢复、保存失败；旧版/损坏/未知版本/来源移除由单元测试覆盖 |
| E14 | Chrome 五个指定视口及放大文字；Safari 原生页面 200% 缩放完成实际操作。无固定底部遮挡，窄屏允许纵向滚动 |
| E15 | 主题中实际使用的文字/背景组合至少 4.5:1，必要边界、状态与焦点组合至少 3:1；禁用/锁定仍可读。见 `tests/unit/visual.test.ts` |
| E16 | Chrome 键盘从首页进入、选择题数、作答、下一题；焦点环可见；Shift+Tab 在弹窗内循环，Escape 不提交，取消回到触发控件 |
| E17 | Chrome reduced-motion 下答案过渡为 0s；题面本来就没有动画或延时呈现 |
| E18 | 请求检查无第三方 HTTP/font 请求；本地八份采样与许可、系统字体，无外部图标库 |
| E19 | 实际页面截图如下；原生 Safari 200% 的工具截图/无障碍状态留在本任务执行记录，不冒充 Chrome CSS 放大截图 |
| E20 | `schemaVersion: 2`，首次答案/模式/来源独立；v1 摘要迁移和未知版本保留测试通过。本次空项目不存在可直接回归的旧实现或用户历史样本 |

## 视口与布局

| CSS 视口 | 已验证 |
| --- | --- |
| 1440 × 900 | 主区居中，七项一行，答题及下一题在一屏内 |
| 1280 × 720 | 缩小上下留白，核心答题区可达，下一题不需滚动 |
| 768 × 1024 | 七项等宽紧凑排列，没有页面横向溢出 |
| 390 × 844 | 首页单列，七项四加三，等宽，正常错误反馈不移动下一题 |
| 320 × 568 | 四加三，页面无横向溢出；报告、复选项、历史可用；矩阵仅容器内部滚动 |
| Chrome 640 × 450 + 200% 根文字 | 验证额外文字重排，内容能增长、下一题可滚动到达；这项不叫浏览器页面缩放 |
| Safari 原生 200% | 原生菜单显示 200%，大字答题布局与七个选项正常换行，选答、暂停恢复与下一题可执行 |

## 截图索引

所有文件位于 `artifacts/screenshots/`，文件名标示状态及 CSS 视口。

- 首页：[1440 × 900](artifacts/screenshots/home-1440x900.png)、[1280 × 720](artifacts/screenshots/home-1280x720.png)、[768 × 1024](artifacts/screenshots/home-768x1024.png)、[390 × 844](artifacts/screenshots/home-390x844.png)、[320 × 568](artifacts/screenshots/home-320x568.png)。
- 作答前：[1440 × 900](artifacts/screenshots/answering-1440x900.png)。
- 练习答错：[1440 × 900](artifacts/screenshots/practice-wrong-1440x900.png)、[1280 × 720](artifacts/screenshots/practice-wrong-1280x720.png)、[768 × 1024](artifacts/screenshots/practice-wrong-768x1024.png)、[390 × 844](artifacts/screenshots/practice-wrong-390x844.png)、[320 × 568](artifacts/screenshots/practice-wrong-320x568.png)。
- 考试中性确认：[1440 × 900](artifacts/screenshots/exam-recorded-1440x900.png)。
- 考试报告与强化选择：[1440 × 900](artifacts/screenshots/exam-report-selection-1440x900.png)、[320 × 568](artifacts/screenshots/exam-report-selection-320x568.png)。
- 强化复习：[1440 × 900](artifacts/screenshots/reinforcement-review-1440x900.png)。
- 全对报告：[1280 × 720](artifacts/screenshots/all-correct-report-1280x720.png)。
- 音频异常：[1280 × 720](artifacts/screenshots/audio-error-1280x720.png)。
- 历史：[320 × 568](artifacts/screenshots/history-320x568.png)。
- 额外文字放大：[640 × 450、200% 根文字](artifacts/screenshots/text-200-percent-reflow-640x450.png)。

## 音乐、状态与数据的证据边界

纯函数验证覆盖十二调全部 84 个音、A4=440Hz、F♯ 的 E♯ 拼写、均衡洗牌袋、独立选项、最大余数和共享端点配额、所有七音为目标、单组 3/4 各 8 次、真实错选方向、首次计分及中位数。状态测试核查未答中断使耗时无效、已答中断不抹除原记录、重复提交/结算去重。存储测试核查未知数据不覆盖、备份失败、内存提示、上限与来源快照分离。

浏览器完整运行一场 35 题示例考试和一场 21 题强化，核对原考试内容未被修改；历史可重开来源报告并重新选择强化。截图不能替代这些测试。没有执行过的真机/读屏/人工听验项目明确保留待验，不声称全平台验收通过。

# 立场之间 v2.1 · 政治价值与政策取向自测

正式站点：https://zz.sun2snow.dpdns.org/ 。静态 GitHub Pages，通过 GitHub Actions 在全部检查通过后发布 `_site/` 产物，CNAME保持不变。Pages 的发布来源须选择 **GitHub Actions**，不得保留 main 根目录自动发布，否则会绕过测试门禁。

新版采用较简单的中文表述：96道基础题，按基础答案的分散情况最多追加40题，每方面4题，可跳过。结果显示基础分和包含补充题的当前分数，并在证据足够时总结最贴近的思想传统；初步中间画像另加10道可跳过的澄清题。所有方法链接显示排版后的HTML页面。

未经过真人样本、阅读年级或信效度校准。答案只在浏览器本地处理，保存进度需主动选择，没有账号和分析追踪。

## 兼容

v2相对v1改写了题意，使用独立存储键和带版本的答案文件。v1旧进度不被覆盖，也不自动迁移；在[旧版入口](legacy/v1/)继续作答或导入原始v1 JSON。v2.1兼容v2.0答案和本地进度。新版导出保留未激活的补充答案，但它们不会计入当前分数。

## 开发与复核

- `python3 -m http.server 8765 --directory . --bind 127.0.0.1`：本地预览。
- `node --test tests/*.test.mjs`：验证新版规则、旧版兼容、存档竞态和输入安全。
- `npm ci && npx playwright install chromium`：按锁文件准备浏览器测试依赖（网页运行不需要这些依赖）。
- `npm run build`：生成只包含网站资源的 `_site/` 发布目录。
- `SITE_ROOT=_site npm run test:e2e`、`SITE_ROOT=_site npm run test:audit`：验证待发布产物的完整流程与安全回归。
- `node scripts/score-cli.mjs answers-v2.json`：本地生成报告；加`--json`输出结构化结果。
- `python3 scripts/revise-bank.py`：从已审阅的文字源重建v2题库。
- `python3 scripts/build-docs.py`：重建HTML文档和下载包；需要Python Markdown包（仅构建时使用，网页运行不需要依赖）。

正式题库为data.json；补充规则为adaptive.mjs；计分为core.mjs；单一总结为ideology.mjs；前端视图与交互拆分为app.js与ui/*.mjs，支持三视角十维雷达图、24种参考画像图谱弹窗、各维度逐题作答明细与跳转修改、键盘快捷作答、浅色/深色外观切换、URL Hash视图导航及未保存离开提醒。修改题目或规则需要升版本并验证。更多说明见[计分及加题规则](docs/计分与解释规范.html)和[归纳方法](docs/最贴近意识形态规则.html)。


## 存档与隐私保护

答案仍然仅在本地处理、明文保存于浏览器网站数据中，不提供加密保险库功能。保存需主动选择，并要求 HTTPS/localhost 与 Web Locks 支持。写入失败、保存尚未完成或出现跨页冲突时，未落盘答案仍触发离页提醒；浏览器或操作系统强制关闭无法保证提醒。

多标签页写入使用同名 Web Lock 串行化，并核对存档修订；出现冲突时停止旧页保存，提示先导出再刷新，**不静默合并或覆盖**。清除会使用独立的非敏感撤销标记（`political-values-v2-local-epoch`，不含答案）作废旧页写入，关联页同步清空。即使存储操作被浏览器拒绝，当前页面内存也会清空，并提示手动清理网站数据。

## 发布与嵌入防护

CI 固定 Playwright 版本、npm 锁文件与 Actions 提交 SHA，测试任务只授予读取权限。仅 main 的 push/手动执行能在 `test` 成功后运行 `deploy`；PR 不发布。浏览器检查运行于 `_site/`，不会将 node_modules、测试数据或 CI 配置带入网站。

主站、旧版入口与方法文档通过 `security.js` 提前隐藏嵌入页面；问卷被嵌入时不初始化、不读取答案。GitHub Pages 本身不支持仓库自定义 HTTP 响应头，因此该前端拦截**不等同于**服务器级 `frame-ancestors`。若域名前配置反向代理，仍应添加：`Content-Security-Policy: frame-ancestors 'none'` 与 `X-Frame-Options: DENY`，并对主站、旧版与文档统一生效。

## v2.1：澄清中间位置

问卷版本为2.1.0-exploratory，归纳规则为nearest-tradition-2.2。初步中间画像增加10道可跳过的澄清题，区分真实折中、混合立场和不确定；不会改变十维分数。导出以独立clarifications字段保存C_D1—C_D10；兼容v2.0答案导入。详见docs/最贴近意识形态规则.html。


## 24种参考画像

参考画像集中维护在ideology-profiles.mjs，按自由主义、社会主义与公共保障、保守主义、生态政治、治理与发展、折中六组展示。构建脚本从同一来源生成坐标表、说明和边界，避免文档与程序漂移。归纳规则2.2保留原12个坐标，新增12种参考画像；分数不变，但同样答案的最近标签可能变化。

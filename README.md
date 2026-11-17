# 立场之间 v2 · 政治价值与政策取向自测

正式站点：https://zz.sun2snow.dpdns.org/ 。静态 GitHub Pages，main分支根目录发布，CNAME保持不变。

新版采用较简单的中文表述：96道基础题，按基础答案的分散情况最多追加40题，每方面4题，可跳过。结果显示基础分和包含补充题的当前分数，并总结最贴近的思想传统。所有方法链接显示排版后的HTML页面。

未经过真人样本、阅读年级或信效度校准。答案只在浏览器本地处理，保存进度需主动选择，没有账号和分析追踪。

## 兼容

新版题意已改写，使用独立存储键和带版本的答案文件。旧进度不被覆盖，也不自动迁移；在[旧版入口](legacy/v1/)继续作答或导入原始旧版JSON。新版导出保留未激活的补充答案，但它们不会计入当前分数。

## 开发与复核

- `python3 -m http.server 8765 --directory . --bind 127.0.0.1`：本地预览。
- `node --test tests/*.test.mjs`：验证新版规则和旧版兼容。
- `node scripts/score-cli.mjs answers-v2.json`：本地生成报告；加`--json`输出结构化结果。
- `python3 scripts/revise-bank.py`：从已审阅的文字源重建v2题库。
- `python3 scripts/build-docs.py`：重建HTML文档和下载包；需要Python Markdown包（仅构建时使用，网页运行不需要依赖）。

正式题库为data.json；补充规则为adaptive.mjs；计分为core.mjs；单一总结为ideology.mjs。修改题目或规则需要升版本并验证。更多说明见[计分及加题规则](docs/计分与解释规范.html)和[归纳方法](docs/最贴近意识形态规则.html)。

# 仓库维护说明

本说明适用于整个仓库。只维护 v2.2；界面、方法文档和维护说明用中文。网站是静态 GitHub Pages 应用，运行时不依赖后端、外部字体或第三方脚本。

## 修改前先区分四类规则

- **题库**：`scripts/revise-v22.py` 从冻结的 `legacy/v2.1/data.json` 生成 `data.json`。改写题义要保留修订记录，更新题库版本和导入校验；不要把旧答案迁入新题。
- **计分与流程**：`core.mjs` 计算十维分数，`adaptive.mjs` 决定补充题，`flow.mjs` 组装页面。情境题、反馈题和澄清题都不计入十维分数。
- **参考画像**：`ideology-profiles.mjs` 保存坐标；`ideology.mjs` 分别处理距离排序、澄清后的归纳和候选展示。只改展示，不应改变排序或分数；修改归纳规则须记录其独立版本。
- **交互与隐私**：`app.js`、`ui/` 负责路由、答题、存档和报告。答案只在本地处理，持久保存须主动选择。不得引入追踪、上传答案、自动覆盖冲突存档或删除旧版进度。

## 验证改动

先读 [README.md](README.md) 和 [TESTING.md](TESTING.md)。改动题目或规则时，在对应方法文档中说明原因，并为行为变化加带编号的回归用例。需要重建方法文档或下载包时，运行 `python3 scripts/build-docs.py`（需 Python Markdown）。保留当前 `questionnaire-v2.zip`：它是网站的下载内容，也是测试输入。

```sh
npm ci
npx playwright install chromium
npm test
npm run build
SITE_ROOT=_site npm run test:e2e
SITE_ROOT=_site npm run test:audit
```

## 归档与发布

- `legacy/v1/index.html` 是停用说明；不要恢复旧应用。保留历史题库、计分对照和实验原始记录。不要把旧下载包、依赖目录、构建输出、个人答案或密钥加入 Git。
- `experiments/ideology/` 用于离线复算，不进入网站。复核已有结果按其 [README](experiments/ideology/README.md) 操作，不必请求模型。新模型实验须另获授权并使用新目录；合成答卷或回归测试不是心理测量效度证据。
- 发布清单在 `scripts/build-site.mjs`。只发布 CI 测过的 `_site/`，不要改为从仓库根目录发布。仅在用户明确要求时推送或部署；发布后分别核对 Actions 与自定义域名 `zz.sun2snow.dpdns.org` 的实际文件。

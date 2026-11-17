from pathlib import Path
import json,html,re,zipfile
import markdown
ROOT=Path(__file__).resolve().parent.parent
b=json.loads((ROOT/'data.json').read_text())
lookup={q['id']:q for q in b['items']+b['scenarios']+b['feedback']}
intro=['# 政治价值与政策取向问卷 v2','',
'基础96题，按回答情况最多追加40道补充题及10道澄清题。基础部分预计25—35分钟，按需题最多另需约20分钟，实际时间尚待试测。没有标准答案，可以跳过或修改。',
'新版用更常用的词和短句，但尚未通过初中学历参与者的阅读测试。不要把结果当作身份认定。',
'## 立场题选项','',
'1＝非常不同意；2＝比较不同意；3＝既不赞同也不反对；4＝比较同意；5＝非常同意；U＝不了解／无法判断；Q＝题意不清；空白＝跳过。','']
for n,iid in enumerate(b['administration_order'],1):
    q=lookup[iid]
    if n==81:intro+=['## 情境题','','按给定情况选择A、B、C或U；也可以跳过。情况改变时，可以改变选择。','']
    if n==93:intro+=['## 作答反馈','','以下题目不计入立场分数。','']
    intro += [f'### {n}. {q["text"]}',f'编号：`{iid}`','']
    if q.get('help'):intro += [q['help'],'']
    if 'options' in q:intro += [f'- {k}：{v}' for k,v in q['options'].items()]+['']
intro+=['## 按需补充题','','只有触发对应方面时才需要作答，每方面4题，可以跳过。具体规则见[计分说明](计分与解释规范.html)。','']
for q in b['items']:
    if q['status']=='supplemental':intro += [f'### {q["id"]} {q["text"]}','']
intro+=['',(ROOT/'docs/澄清题.md').read_text()]
(ROOT/'docs/问卷.md').write_text('\n'.join(intro))
review=['# 新版题目覆盖与阅读自查','','本版逐题改用常用词，将较长条件分成句子，并为部分术语增加就地解释。这里是设计者自查，不是阅读水平或测量效度的验证。','',
'| 方面 | 基础题 | 补充题 |','|---|---|---|']
for d in b['dimensions']:
    review.append(f'| {d["name"]} | {d["id"]}_01—08 | {d["id"]}_09—12 |')
review+=['','## 仍需留意的问题','','公共经营、价格管理和员工参与不一定属于同一种经济观点；传统文化保护不等于限制个人自由；支持专家决策不等于反对民主。国际关系、国家制度和个人生活经验也可能影响理解。结果因此保留逐题方向和分散情况，不强行把不同想法叫作矛盾。','','每个方面的补充题从不同场景提出问题，并保持两个计分方向各2题。但这些题尚未经过真人验证，不能证明一定提高准确性。','','新版不再直接用旧版答案计算；旧版文件保留在旧版入口。']
(ROOT/'docs/覆盖矩阵与内容审查.md').write_text('\n'.join(review))
notes=['# v2逐题说明','','方向+表示同意后趋向该方面右端，方向−表示趋向左端。先作答再查看，避免受计分方向影响。','']
for q in b['items']:
    notes += [f'## {q["id"]} · {"基础" if q["status"]=="core" else "补充"} · {"+" if q["direction"]==1 else "−"}',q['text'],'',q.get('help',''),'',q['review_decision'],'']
(ROOT/'docs/题库与逐题审查.md').write_text('\n'.join(notes))
(ROOT/'docs/item-bank.json').write_text(json.dumps(b,ensure_ascii=False,indent=2)+'\n')
# Generate both the coordinate table and all profile explanations from the runtime catalog.
profiles=json.loads((ROOT/'ideology-profiles.mjs').read_text().split('export const IDEOLOGIES = ',1)[1].strip().removesuffix(';'))
catalog=['| 名称 | D1 | D2 | D3 | D4 | D5 | D6 | D7 | D8 | D9 | D10 |','|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
for p in profiles:catalog.append('| '+p['name']+' | '+' | '.join(map(str,p['point']))+' |')
catalog+=['','## 全部参考画像：含义与边界','']
for family in dict.fromkeys(p['family'] for p in profiles):
    catalog += ['### '+family,'']
    for p in profiles:
        if p['family']==family:catalog += ['#### '+p['name'],'',p['description'],'','解释边界：'+p['limitation'],'']
path=ROOT/'docs/最贴近意识形态规则.md'
s=path.read_text();s=re.sub(r'<!-- REFERENCE_CATALOG_START -->.*?<!-- REFERENCE_CATALOG_END -->','<!-- REFERENCE_CATALOG_START -->\n'+'\n'.join(catalog)+'\n<!-- REFERENCE_CATALOG_END -->',s,flags=re.S);path.write_text(s)
# Static HTML: no runtime Markdown dependency or unsafe HTML passthrough from visitors.
for folder,home in [(ROOT/'docs','../'),(ROOT/'legacy/v1/docs','../')]:
    for src in folder.glob('*.md'):
        title=src.read_text().splitlines()[0].lstrip('# ').strip()
        body=markdown.markdown(src.read_text(),extensions=['tables','fenced_code','sane_lists'])
        body=re.sub(r'<table>(.*?)</table>',r'<div class="table-scroll" tabindex="0" role="region" aria-label="可横向滚动的参考表格"><table>\1</table></div>',body,flags=re.S)
        body=re.sub(r'href="([^"#]+)\.md([#][^"]*)?"',lambda m:f'href="{m[1]}.html{m[2] or ""}"',body)
        doc=f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)} · 立场之间</title><link rel="stylesheet" href="{home}styles.css"><link rel="icon" href="{home}icon.svg"><meta name="description" content="立场之间的问卷方法、计分和思想传统参考说明"></head><body><a class="skip" href="#document">跳到正文</a><header class="site-header"><a class="brand" href="{home}"><span class="brand-mark">↔</span>立场之间</a><a href="{home}">返回问卷</a></header><main class="method-page" id="document"><nav class="method-nav" aria-label="方法文档"><a href="计分与解释规范.html">计分与补充题</a><a href="最贴近意识形态规则.html">思想传统参考</a><a href="真人试测与校准方案.html">试测计划</a></nav>{body}</main><footer class="site-footer">探索性问卷 · 尚未实证校准</footer></body></html>'''
        src.with_suffix('.html').write_text(doc)
# Old entry points also receive readable pages, without changing their questions or storage.
p=ROOT/'legacy/v1/app.js';s=p.read_text();s=re.sub(r'href="(docs/[^"\n]+)\.md"',r'href="\1.html"',s);p.write_text(s)
p=ROOT/'legacy/v1/styles.css';s=p.read_text();marker='.method-page{';new=(ROOT/'styles.css').read_text();tail=new[new.index(marker):];
if marker not in s:p.write_text(s+'\n'+tail)
# Download contains the same v2 bank, scoring modules and readable docs as the website.
with zipfile.ZipFile(ROOT/'questionnaire-v2.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in ['data.json','core.mjs','adaptive.mjs','ideology.mjs','ideology-profiles.mjs','clarification.mjs','flow.mjs','README.md','styles.css','icon.svg','scripts/score-cli.mjs']:
        z.write(ROOT/name,name)
    for path in (ROOT/'docs').iterdir():
        if path.is_file():z.write(path,path.relative_to(ROOT))

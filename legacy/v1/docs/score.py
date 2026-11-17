#!/usr/bin/env python3
"""Local-only exploratory questionnaire scoring; Python 3.10+, no dependencies."""
from pathlib import Path
import argparse
import json
import sys

BASE = Path(__file__).resolve().parent
VERSION = '1.0.0-exploratory'
# Heuristic descriptions, not an empirically fitted classification model.
PROFILES = [
    ('自由主义中的公民自由传统', [('D3', 'high'), ('D4', 'high'), ('D6', 'high')],
     '自由主义内部对经济分配和公共所有的主张差异很大，此提示不确定你的经济路线。'),
    ('社会民主主义的部分取向', [('D1', 'high'), ('D3', 'high'), ('D4', 'high')],
     '还需结合对市场经济、劳动制度与公共服务的具体看法；这些分数也可能见于其他平等主义传统。'),
    ('参与式民主社会主义的部分取向', [('D1', 'high'), ('D2', 'high'), ('D5', 'high'), ('D3', 'high'), ('D4', 'high')],
     '公共规划、再分配与参与的结合并不足以确认社会主义身份；仍需了解所有权和权利保障的具体主张。'),
    ('宪政保守主义的部分取向', [('D6', 'low'), ('D4', 'high'), ('D2', 'low')],
     '此处仅描述文化延续、权力约束与市场配置的组合，不涵盖所有保守主义流派。'),
    ('市场自由意志主义的部分取向', [('D1', 'low'), ('D2', 'low'), ('D3', 'high'), ('D4', 'high')],
     '需要进一步了解对国家职能、财产权及自愿结社的看法；此提示不代表无政府主义。'),
    ('强调共同文化与主权的民族主义取向', [('D7', 'low'), ('D8', 'low')],
     '民族主义也存在多元公民认同形式；此组合不推导排外、军事扩张或对任何具体国家的支持。'),
    ('国际合作型绿色政治的部分取向', [('D10', 'high'), ('D8', 'high'), ('D5', 'high')],
     '绿色政治还存在市场型、保守型和国家自主型取向；未触发此提示不代表不关心生态。'),
]


def load_bank():
    return json.loads((BASE / 'item-bank.json').read_text(encoding='utf-8'))


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f'JSON中出现重复编号：{key}')
        result[key] = value
    return result


def load_answers(path):
    return json.loads(Path(path).read_text(encoding='utf-8'), object_pairs_hook=unique_object)


def validate_answers(answers, bank):
    if not isinstance(answers, dict):
        raise ValueError('答案必须是以题目编号为键的JSON对象。')
    core = {i['id'] for i in bank['items'] if i['status'] == 'core'}
    scenes = {i['id'] for i in bank['scenarios']}
    feedback = {i['id'] for i in bank['feedback']}
    allowed = core | scenes | feedback
    for key, value in answers.items():
        if key not in allowed:
            raise ValueError(f'未知或未启用的题目编号：{key}')
        if value is None:
            continue
        if key in core:
            ok = (type(value) is int and 1 <= value <= 5) or (type(value) is str and value in ('U', 'Q'))
        elif key in scenes:
            ok = type(value) is str and value in ('A', 'B', 'C', 'U')
        else:
            ok = type(value) is int and 1 <= value <= 5
        if not ok:
            raise ValueError(f'{key}的答案无效：核心题为整数1—5、U、Q或null；情境题为A/B/C/U或null；反馈题为整数1—5或null。')


def score(answers, bank=None):
    bank = load_bank() if bank is None else bank
    validate_answers(answers, bank)
    dims = []
    for d in bank['dimensions']:
        items = [i for i in bank['items'] if i['status'] == 'core' and i['dimension'] == d['id']]
        normalized = []
        counts = dict(left=0, neutral=0, right=0, unknown=0, unclear=0, skipped=0)
        evidence = []
        for item in items:
            value = answers.get(item['id'])
            if type(value) is int:
                z = (value - 3) * item['direction']
                normalized.append(z)
                counts['left' if z < 0 else 'right' if z > 0 else 'neutral'] += 1
                evidence.append(dict(id=item['id'], facet=item['facet'], normalized=z))
            else:
                counts['unknown' if value == 'U' else 'unclear' if value == 'Q' else 'skipped'] += 1
        valid = len(normalized) >= d['minimum_answered']
        raw_score = 25 * (sum(normalized) / len(normalized) + 2) if valid else None
        # Use unrounded score for thresholds; round only for output.
        band = None if not valid else 'low' if raw_score <= 35 else 'high' if raw_score >= 65 else 'middle'
        dims.append(dict(**d, answered=len(normalized), score=None if raw_score is None else round(raw_score, 2),
                         band=band, counts=counts, evidence=evidence))
    by_id = {d['id']: d for d in dims}
    profiles = []
    for name, requirements, caveat in PROFILES:
        supporting, contrary, uncertain = [], [], []
        for did, direction in requirements:
            d = by_id[did]
            if d['score'] is None:
                uncertain.append(did)
            elif d['band'] == direction:
                supporting.append(did)
            elif d['band'] == 'middle':
                uncertain.append(did)
            else:
                contrary.append(did)
        profiles.append(dict(name=name, requirements=[dict(dimension=i, band=b) for i,b in requirements],
                             triggered=not contrary and not uncertain, supporting=supporting,
                             contrary=contrary, uncertain=uncertain, caveat=caveat))
    scenes = []
    for s in bank['scenarios']:
        value = answers.get(s['id'])
        scenes.append(dict(id=s['id'], theme=s['theme'], choice=value,
                           text=None if value is None else s['options'][value]))
    pairs = []
    for i in range(0, len(scenes), 2):
        a, b = scenes[i:i+2]
        complete = a['choice'] in ('A','B','C') and b['choice'] in ('A','B','C')
        pairs.append(dict(theme=a['theme'], ids=[a['id'], b['id']],
                          status='信息不足' if not complete else '条件变化后选择不同' if a['choice'] != b['choice'] else '两种条件下选择相同'))
    feedback = [dict(id=f['id'], question=f['text'], answer=answers.get(f['id']),
                     text=f['options'].get(str(answers.get(f['id'])))) for f in bank['feedback']]
    return dict(version=bank['version'], validated=False, dimensions=dims, profiles=profiles,
                scenarios=scenes, scenario_pairs=pairs, feedback=feedback,
                scored_answers=sum(d['answered'] for d in dims))


def render_report(result, title='政治价值与政策取向报告'):
    lines=[f'# {title}', '', f'问卷版本：{result["version"]}。有效核心作答：{result["scored_answers"]}/80。', '',
           '**这是未经真人样本校准的探索性结果。分数表示本问卷中的回答方向，不是人口百分位、准确率或价值优劣，也不是对你身份的鉴定。**', '',
           '## 多维画像', '', '| 维度 | 0端 → 100端 | 位置（0—100） | 分数 | 有效题数 |', '|---|---|---|---:|---:|']
    for d in result['dimensions']:
        display='信息不足' if d['score'] is None else f'{d["score"]:.1f}'
        position = None if d['score'] is None else round(d['score'] / 5)
        bar = '—' if position is None else '`' + '·' * position + '●' + '·' * (20-position) + '`'
        lines.append(f'| {d["name"]} | {d["low"]} → {d["high"]} | {bar} | {display} | {d["answered"]}/8 |')
    lines += ['', '图中左右只表示本维度的端点，不等于传统政治左派与右派。位置点按5分刻度近似显示，以数值为准。分数≥65或≤35仅作为首版解释提示的设计阈值，未经实证校准；35—65之间也不等于没有立场。每维度至少回答6题才显示分数。', '', '## 立场、混合与信息不足', '']
    for d in result['dimensions']:
        c=d['counts']
        if d['score'] is None:
            desc='有效作答不足6题，不解释方向。'
        elif d['band']=='high':
            desc=f'本组回答较偏向“{d["high"]}”。'
        elif d['band']=='low':
            desc=f'本组回答较偏向“{d["low"]}”。'
        else:
            desc='平均分处于中间区域，应结合题目分布理解。'
        if c['left'] >= 2 and c['right'] >= 2:
            desc+='不同议题出现双向选择，可能反映条件性或混合立场；不是错误标记。'
        if d['answered'] and c['neutral'] >= d['answered']/2:
            desc+='至少一半有效答案为中立。'
        lines.append(f'- **{d["name"]}**：{desc} 方向统一后，左向{c["left"]}题、中立{c["neutral"]}题、右向{c["right"]}题；无法判断{c["unknown"]}题、题意不清{c["unclear"]}题、跳过{c["skipped"]}题。')
    lines += ['', '## 情境中的取舍', '', '情境题单独呈现，不计入维度分数。配对题同时包含具体条件和叙事情境，不能据此估计某个条件的因果效应。', '']
    for pair in result['scenario_pairs']:
        lines.append(f'- **{pair["theme"]}**（{"、".join(pair["ids"])}）：{pair["status"]}。')
        for s in result['scenarios']:
            if s['id'] in pair['ids']:
                lines.append(f'  - {s["id"]}：{s["text"] or "未作答"}')
    lines += ['', '## 思想传统参考', '', '以下是预先规定的组合提示，不是匹配概率、排名或唯一分类。多个提示可以并存；未出现某个提示不表示排除该思想传统。', '']
    triggered=[p for p in result['profiles'] if p['triggered']]
    if not triggered:
        lines.append('目前没有触发预设的组合提示，或所需信息不足。请优先使用多维画像理解答案。')
    by_id={d['id']:d for d in result['dimensions']}
    for p in triggered:
        evidence='、'.join(f'{by_id[i]["name"]}（{by_id[i]["score"]:.1f}）' for i in p['supporting'])
        lines.append(f'- **{p["name"]}**：支持线索为{evidence}。限定：{p["caveat"]}')
    lines += ['', '## 自述作答状态', '', '这些反馈只帮助你判断是否值得休息后重新作答，不改变分数，不推导诚实程度。', '']
    for f in result['feedback']:
        lines.append(f'- {f["question"]} {f["text"] or "未作答"}。')
    lines += ['', '## 如何使用结果', '',
              '回看得分方向与你自我理解不一致的题目，记录适用条件；不要只依据均值贴标签。维度中的议题可能并不形成单一轴，较高或较低的均值都不能替代逐题观点。未校准前，小幅分差与跨次变化不宜解释为实质差异。', '',
              '报告没有估计统计置信区间、个人测量误差或任何人口排名。政治观点可能随信息和经历改变。请自行决定是否保留或分享答案与报告。', '']
    return '\n'.join(lines)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('answers', help='答案JSON文件路径')
    parser.add_argument('--format', choices=('markdown','json'), default='markdown')
    args=parser.parse_args()
    try:
        result=score(load_answers(args.answers))
    except (ValueError, OSError) as exc:
        print(f'错误：{exc}', file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2) if args.format=='json' else render_report(result))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

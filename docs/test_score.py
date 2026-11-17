import json
from pathlib import Path
import unittest
import score


class ScoringTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bank=score.load_bank()
        cls.core=[i for i in cls.bank['items'] if i['status']=='core']

    def test_inventory_and_balance(self):
        self.assertEqual(len(self.bank['items']),120)
        self.assertEqual(len(self.core),80)
        self.assertEqual(len(self.bank['scenarios']),12)
        self.assertEqual(len(self.bank['feedback']),4)
        order=self.bank['administration_order']
        self.assertEqual(len(order),96)
        self.assertEqual(len(set(order)),96)
        self.assertEqual(set(order),{i['id'] for i in self.core+self.bank['scenarios']+self.bank['feedback']})
        for d in self.bank['dimensions']:
            rows=[i for i in self.core if i['dimension']==d['id']]
            self.assertEqual(len(rows),8)
            self.assertEqual(sum(i['direction'] for i in rows),0)
            for offset in (0,20,40,60):
                block=[i for i in rows if i['id'] in order[offset:offset+20]]
                self.assertEqual(len(block),2)
                self.assertEqual(sum(i['direction'] for i in block),0)

    def test_extremes(self):
        for endpoint, positive, negative in ((100,5,1),(0,1,5)):
            answers={i['id']:positive if i['direction']==1 else negative for i in self.core}
            self.assertTrue(all(d['score']==endpoint for d in score.score(answers)['dimensions']))

    def test_neutral_is_not_opposition(self):
        result=score.score({i['id']:3 for i in self.core})
        for d in result['dimensions']:
            self.assertEqual(d['score'],50)
            self.assertEqual(d['counts']['neutral'],8)
            self.assertEqual(d['counts']['left'],0)
        self.assertFalse(any(p['triggered'] for p in result['profiles']))

    def test_straight_agreement_is_mixed_not_neutral(self):
        result=score.score({i['id']:5 for i in self.core})
        for d in result['dimensions']:
            self.assertEqual(d['score'],50)
            self.assertEqual(d['counts']['left'],4)
            self.assertEqual(d['counts']['right'],4)
            self.assertEqual(d['counts']['neutral'],0)
        self.assertIn('双向选择',score.render_report(result))

    def test_missing_not_neutral(self):
        result=score.score({'D1_01':'U','D1_02':'Q','D1_03':None})
        d=result['dimensions'][0]
        self.assertIsNone(d['score'])
        self.assertEqual(d['counts']['unknown'],1)
        self.assertEqual(d['counts']['unclear'],1)
        self.assertEqual(d['counts']['skipped'],6)
        self.assertFalse(any(p['triggered'] for p in result['profiles']))

    def test_minimum_boundary(self):
        for n in (5,6):
            ans={f'D1_{i:02d}':4 if i%2 else 2 for i in range(1,n+1)}
            d=score.score(ans)['dimensions'][0]
            self.assertEqual(d['score'],None if n==5 else 75)

    def test_reverse_direction(self):
        # Four positive items rated 4, four negative items rated 1: mean z=1.5.
        ans={f'D1_{i:02d}':4 if i%2 else 1 for i in range(1,9)}
        self.assertEqual(score.score(ans)['dimensions'][0]['score'],87.5)

    def test_feedback_scenarios_do_not_change_scores(self):
        a={i['id']:4 for i in self.core}
        before=score.score(a)
        a.update({s['id']:'B' for s in self.bank['scenarios']})
        a.update({f['id']:5 for f in self.bank['feedback']})
        after=score.score(a)
        self.assertEqual(before['dimensions'],after['dimensions'])
        self.assertEqual(before['profiles'],after['profiles'])

    def test_scenario_pair_status(self):
        r=score.score({'S01':'A','S02':'B','S03':'C','S04':'C','S05':'U','S06':'A'})
        self.assertEqual([p['status'] for p in r['scenario_pairs'][:3]],['条件变化后选择不同','两种条件下选择相同','信息不足'])

    def test_bad_inputs_rejected(self):
        invalid=[[], {'D1_01':True},{'D1_01':0},{'D1_01':6},{'D1_01':3.0},{'D1_01':'3'},
                 {'D1_09':3},{'D11_01':3},{'S01':1},{'S01':'Q'},{'F01':'U'},{'F01':False}]
        for ans in invalid:
            with self.subTest(ans=ans), self.assertRaises(ValueError):
                score.score(ans)

    def test_duplicate_keys_rejected(self):
        with self.assertRaises(ValueError):
            json.loads('{"D1_01":1,"D1_01":5}',object_pairs_hook=score.unique_object)

    def test_rule_evidence_and_missing_prerequisite(self):
        ans={i['id']:5 if i['direction']==1 else 1 for i in self.core}
        r=score.score(ans)
        liberal=next(p for p in r['profiles'] if p['name']=='自由主义中的公民自由传统')
        self.assertTrue(liberal['triggered'])
        self.assertEqual(liberal['supporting'],['D3','D4','D6'])
        for i in self.core:
            if i['dimension']=='D3': ans.pop(i['id'])
        r=score.score(ans)
        liberal=next(p for p in r['profiles'] if p['name']=='自由主义中的公民自由传统')
        self.assertFalse(liberal['triggered'])
        self.assertEqual(liberal['uncertain'],['D3'])

    def test_questionnaire_and_audit_cover_bank(self):
        question=(score.BASE/'问卷.md').read_text()
        audit=(score.BASE/'题库与逐题审查.md').read_text()
        for i in self.core+self.bank['scenarios']+self.bank['feedback']:
            self.assertIn(i['text'],question)
        for i in self.bank['items']:
            self.assertIn(i['text'],audit)
        self.assertEqual(question.count('答案记录编号：'),96)

    def test_no_answer_report(self):
        r=score.score({})
        self.assertEqual(r['scored_answers'],0)
        report=score.render_report(r)
        self.assertIn('信息不足',report)
        self.assertNotIn('nan',report)
        self.assertNotIn('None',report)


if __name__=='__main__':
    unittest.main()

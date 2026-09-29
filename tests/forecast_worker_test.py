"""Independent exact numerical oracles and injected candidate failures."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'packages/forecasting/runtime'))
import worker as w
from decimal import Decimal as D
import unittest
from unittest.mock import patch

class ForecastTests(unittest.TestCase):
    def payload(self):
        periods = w.months('2020-01', 36)
        return dict(version=w.VERSION, series=[dict(period=p, value=str(100+i*2)) for i,p in enumerate(periods)], origin='2023-01', horizon=3, folds=[dict(trainStart=periods[0], trainEnd=periods[n-1], validationStart=periods[n], validationEnd=periods[n+2], trainCount=n, horizon=3) for n in (27,30,33)])
    def test_metrics(self):
        self.assertEqual(w.metrics([D(2),D(4)],[D(1),D(1)]), {'mae':'2.000000','rmse':'2.236068'})
    def test_rounding(self):
        self.assertEqual(w.text(D('1.0000005')), '1.000001')
    def test_moving_average(self):
        self.assertEqual(w.predict('moving_average_3',list(map(D,[1,2,3,4])),3), [D(3)]*3)
    def test_all_failures(self):
        with patch.object(w,'predict',side_effect=ValueError('failure')):
            result=w.run(self.payload())
        self.assertEqual(result['status'],'fallback')
        self.assertTrue(all(c['status']=='failed' for c in result['candidates']))
        self.assertEqual(result['points'],[])
    def test_isolated_failure(self):
        original=w.predict
        def predict(name,y,h):
            if name=='holt': raise ValueError('failure')
            return original(name,y,h)
        with patch.object(w,'predict',side_effect=predict):
            result=w.run(self.payload())
        self.assertEqual(result['candidates'][2]['status'],'failed')
        self.assertEqual(result['candidates'][0]['status'],'succeeded')
    def test_no_leakage_boundary(self):
        payload=self.payload();payload['folds'][0]['trainCount']+=1
        with self.assertRaises(AssertionError): w.run(payload)

unittest.main()

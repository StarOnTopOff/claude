"""LightGBM boosted from the market (production copy of research/q2-fusion/lgbm.py).

init_score = log p_mkt, so the trees only learn corrections to the market's 1X2 prices.
"""
import lightgbm as lgb
import numpy as np
import pandas as pd

from .features import COUNTRY
from .model import design_1x2

# Fixed category list (= the sorted codes, as pandas' astype("category") gives on the full history),
# so a league keeps its code whatever subset of rows is passed in.
LG_CATS = sorted(COUNTRY)
PARAMS = dict(objective="multiclass", num_class=3, learning_rate=0.02, num_leaves=15, min_data_in_leaf=1000,
              feature_fraction=0.7, bagging_fraction=0.7, bagging_freq=1, lambda_l2=50.0, verbose=-1,
              num_threads=2,  # fixed: results are reproducible for a given thread count
              seed=1, max_bin=63)


def design_lgb(f, groups):
    """Same raw inputs as the logit, with the league as one categorical column instead of one-hots."""
    X = design_1x2(f, [g for g in groups if g != "lg"])
    X["lgc"] = pd.Categorical(f.lg, categories=LG_CATS).codes
    return X


def fit(X, off, y, rounds, seed):
    ds = lgb.Dataset(X, y, init_score=off, categorical_feature=["lgc"], free_raw_data=False)
    return lgb.train(dict(PARAMS, seed=seed), ds, num_boost_round=rounds)


def predict(bst, X, off, rounds):
    """softmax(raw tree score + log p_mkt)."""
    z = bst.predict(X, num_iteration=rounds, raw_score=True) + off
    z -= z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)

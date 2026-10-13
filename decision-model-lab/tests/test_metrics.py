import pytest

from decision_model_lab.metrics import calibration_metrics


def test_perfect_predictions_are_accurate_and_well_calibrated():
    rows = [
        {"label": "a", "probabilities": {"a": 1.0, "b": 0.0}},
        {"label": "b", "probabilities": {"a": 0.0, "b": 1.0}},
    ]
    result = calibration_metrics(rows, bins=5)
    assert result["accuracy"] == 1.0
    assert result["ece"] == 0.0
    assert result["brier"] == 0.0
    assert result["nll"] == 0.0


def test_wrong_confident_prediction_is_penalized():
    rows = [{"label": "a", "probabilities": {"a": 0.1, "b": 0.9}}]
    result = calibration_metrics(rows, bins=10)
    assert result["accuracy"] == 0.0
    assert result["ece"] == pytest.approx(0.9)
    assert result["brier"] == pytest.approx(1.62)

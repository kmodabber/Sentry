# ml

Python side of Sentry: PhreshPhish loading, features, training, calibration, evaluation.

```bash
cd ml
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

Raw data lives in `../data/` and is never committed.

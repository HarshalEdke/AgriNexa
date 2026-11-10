# AgriNexa AI Test Suites

This directory contains automated test suites for the system.

## Structure

```text
tests/
├── README.md
├── backend/    # FastAPI integration and endpoint tests
├── model/      # Canonical predict interface and preprocessing tests
└── e2e/        # Playwright browser end-to-end tests
```

## Running Tests

```bash
pytest tests/backend tests/model
```

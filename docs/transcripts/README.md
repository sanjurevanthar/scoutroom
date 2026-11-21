# Transcripts

Each session is exported with:

    /export docs/transcripts/session-NN-<feature>.md

Then clean it **before committing**:

    scripts/redact.sh docs/transcripts/session-NN-<feature>.md > /tmp/clean.md && mv /tmp/clean.md docs/transcripts/session-NN-<feature>.md

The pre-commit hook (`scripts/check-secrets.sh`) scans staged files and blocks the commit if it still finds secret-like content. After cloning, enable it with:

    git config core.hooksPath .githooks

#!/usr/bin/env bash
# Usage: redact.sh [--report] [file]    (reads stdin when no file is given)
#   default  : print input with secrets replaced by [REDACTED]
#   --report : print "LINE: <masked line>" for each line that contains a secret
# Patterns live in redact.pl (single source of truth, also used by check-secrets.sh).
set -u
mode=redact
if [ "${1:-}" = "--report" ]; then mode=report; shift; fi
if [ $# -gt 0 ] && [ ! -r "$1" ]; then echo "redact.sh: cannot read $1" >&2; exit 2; fi
exec perl "$(cd "$(dirname "$0")" && pwd)/redact.pl" "$mode" "$@"

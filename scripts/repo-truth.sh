#!/bin/sh
# repo-truth — the source of truth for repo state is ORIGIN, never your local checkout.
#
# In this shared multi-session tree the working directory is routinely checked out
# on someone else's feature branch, left dirty, or tens of commits stale. So `main`
# (local ref), `HEAD`, and the working tree all LIE about "what's in the repo".
# This script fetches origin first, then answers strictly against origin/main.
#
# Usage:
#   scripts/repo-truth.sh                # summary: where origin/main is + how your checkout compares
#   scripts/repo-truth.sh <commit|branch># is it already on origin/main? (uses merge-base, not the checkout)
#   scripts/repo-truth.sh --file PATH    # does your working copy of PATH match origin/main?
#
# Always prefer this over hand-rolling git: `git log origin/main..main` silently reads
# your STALE local main and is the #1 source of false "divergence" alarms.

set -e

# Operate on the repo this script lives in, regardless of the caller's cwd.
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"

echo "Fetching origin (the source of truth)…"
git fetch origin --quiet

OMAIN=$(git rev-parse --short origin/main)
OSUB=$(git log -1 --format=%s origin/main)
echo "origin/main = $OMAIN  \"$OSUB\""

case "$1" in
  "")
    HEADREF=$(git symbolic-ref --short HEAD 2>/dev/null || echo "(detached HEAD)")
    ahead=$(git rev-list --count origin/main..HEAD)
    behind=$(git rev-list --count HEAD..origin/main)
    dirty=$(git status --porcelain | grep -c . || true)
    localmain=$(git rev-parse --short main 2>/dev/null || echo "none")
    echo ""
    echo "Your local checkout is on: $HEADREF  — NOT the source of truth."
    echo "  vs origin/main:            $ahead ahead, $behind behind"
    echo "  uncommitted files here:    $dirty"
    echo "  your local 'main' ref:     $localmain   (origin/main = $OMAIN)"
    if [ "$localmain" != "$OMAIN" ] && [ "$localmain" != "none" ]; then
      echo "  WARNING: local 'main' is STALE — never compare against it; use origin/main."
    fi
    echo ""
    echo "Rule: assert repo state from origin/main above, never from your local checkout."
    ;;
  --file)
    f="$2"
    [ -n "$f" ] || { echo "usage: repo-truth.sh --file PATH"; exit 2; }
    if git diff --quiet origin/main -- "$f"; then
      echo "OK: $f matches origin/main."
    else
      echo "DIFFERS: $f is not in sync with origin/main —"
      git diff --stat origin/main -- "$f"
    fi
    ;;
  *)
    if git merge-base --is-ancestor "$1" origin/main 2>/dev/null; then
      echo "ON ORIGIN: $1 is already on origin/main (landed)."
    elif git rev-parse --verify --quiet "$1" >/dev/null 2>&1; then
      echo "NOT ON ORIGIN: $1 has commits not yet on origin/main —"
      git log --oneline "origin/main..$1" | head -20
    else
      echo "UNKNOWN: '$1' is not a commit/branch I can resolve."
      echo "  (fetch just ran; check the name, or it may be a remote branch — try origin/$1)"
      exit 1
    fi
    ;;
esac

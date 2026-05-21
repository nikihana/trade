#!/usr/bin/env bash
#
# deploy.sh — the ONLY way to ship the trade app to production.
#
# Bumps the version string, prepends a CHANGELOG entry, typechecks,
# commits, and pushes to main (which triggers the Vercel production deploy).
# The displayed version is therefore guaranteed to increment on every deploy.
#
# Usage:
#   ./deploy.sh "First changelog bullet" ["Second bullet" ...]
#
# Each argument becomes one "- bullet" line in the changelog entry.
# At least one bullet is required.
#
# Env:
#   SKIP_CHECK=1   skip the typecheck step (not recommended)

set -euo pipefail

cd "$(dirname "$0")"

VERSION_FILE="src/app/components/VersionFooter.tsx"
CHANGELOG_FILE="CHANGELOG.md"
BRANCH="main"

# ── Validate args ────────────────────────────────────────
if [ "$#" -lt 1 ]; then
  echo "ERROR: provide at least one changelog bullet." >&2
  echo "Usage: ./deploy.sh \"changelog bullet\" [\"another bullet\" ...]" >&2
  exit 1
fi

# ── Must be on the deploy branch ─────────────────────────
current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current_branch" != "$BRANCH" ]; then
  echo "ERROR: on branch '$current_branch', but deploys must run from '$BRANCH'." >&2
  exit 1
fi

# ── Compute next version ─────────────────────────────────
current_version="$(grep -oE 'v1\.[0-9]+' "$VERSION_FILE" | head -1)"
if [ -z "$current_version" ]; then
  echo "ERROR: could not find a 'v1.NNNNNN' version in $VERSION_FILE" >&2
  exit 1
fi
current_num="${current_version#v1.}"
next_num=$((10#$current_num + 1))
next_version="$(printf 'v1.%06d' "$next_num")"

echo "▸ Version: $current_version → $next_version"

# ── Typecheck before shipping ────────────────────────────
if [ "${SKIP_CHECK:-0}" != "1" ]; then
  echo "▸ Typechecking..."
  npx tsc --noEmit
else
  echo "▸ Skipping typecheck (SKIP_CHECK=1)"
fi

# ── Bump version string ──────────────────────────────────
sed -i '' "s/${current_version}/${next_version}/" "$VERSION_FILE"

# ── Build & prepend changelog entry ──────────────────────
# Write the entry to a temp file (awk -v cannot carry embedded newlines).
date_str="$(date +%Y-%m-%d)"
entry_file="$(mktemp)"
{
  echo "## ${next_version} — ${date_str}"
  for bullet in "$@"; do
    echo "- ${bullet}"
  done
} > "$entry_file"

tmp="$(mktemp)"
awk -v ef="$entry_file" '
  !done && /^# Changelog/ {
    print
    print ""
    while ((getline line < ef) > 0) print line
    done=1
    next
  }
  { print }
' "$CHANGELOG_FILE" > "$tmp"
mv "$tmp" "$CHANGELOG_FILE"
rm -f "$entry_file"

echo "▸ Changelog updated."

# ── Commit & push (triggers Vercel) ──────────────────────
git add -A
git commit -m "$(cat <<EOF
${next_version}: $1

$(printf -- '- %s\n' "$@")
EOF
)"

echo "▸ Pushing to $BRANCH (Vercel will build)..."
git push origin "$BRANCH"

echo "✓ Deployed $next_version"

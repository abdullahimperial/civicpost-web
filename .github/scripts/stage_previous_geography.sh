#!/usr/bin/env bash
# Run in the generated Pages checkout, before packaging the deployment artifact.
set -euo pipefail

retained=0
for revision in $(git rev-list --first-parent --skip=1 --max-count=7 HEAD); do
  # Only protected releases have public, contact-free regional indexes.
  if ! version=$(git show "$revision:release.json" | jq -er '
    select(.contactMode == "api") | .release | strings | select(test("^[a-f0-9]{20}$"))
  '); then
    continue
  fi
  root="data/$version"
  [[ -d "$root" ]] && continue
  git restore --source="$revision" --worktree -- ":(glob)$root/postal/*.json" ":(glob)$root/regions/*.json"
  retained=$((retained + 1))
  [[ $retained -lt 2 ]] || break
done

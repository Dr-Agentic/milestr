#!/usr/bin/env bash
# scripts/check-skill-version.sh
#
# Fails with exit code 1 if SKILL.md's `version:` frontmatter does not match
# `package.json`'s `version` field. Run as part of CI to guarantee the skill
# is bumped on every release.
#
# Usage:
#   ./scripts/check-skill-version.sh
#
# Exit codes:
#   0  versions match
#   1  versions differ
#   2  SKILL.md or package.json missing
#   3  SKILL.md has no version field

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PACKAGE_JSON="${REPO_ROOT}/package.json"
SKILL_MD="${REPO_ROOT}/SKILL.md"

if [[ ! -f "${PACKAGE_JSON}" ]]; then
  echo "ERROR: ${PACKAGE_JSON} not found." >&2
  exit 2
fi

if [[ ! -f "${SKILL_MD}" ]]; then
  echo "ERROR: ${SKILL_MD} not found." >&2
  exit 2
fi

# Extract package.json version (works without jq — pure grep/sed).
PKG_VERSION=$(grep -E '^\s*"version"\s*:' "${PACKAGE_JSON}" | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')

# Extract SKILL.md version from YAML frontmatter.
SKILL_VERSION=$(awk '/^---$/{c++; next} c==1 && /^version:/{sub(/^version:[[:space:]]*/, ""); print; exit}' "${SKILL_MD}")

if [[ -z "${PKG_VERSION}" ]]; then
  echo "ERROR: could not parse version from ${PACKAGE_JSON}" >&2
  exit 2
fi

if [[ -z "${SKILL_VERSION}" ]]; then
  echo "ERROR: no 'version:' field in SKILL.md frontmatter" >&2
  exit 3
fi

if [[ "${PKG_VERSION}" != "${SKILL_VERSION}" ]]; then
  echo "ERROR: version mismatch"
  echo "  package.json: ${PKG_VERSION}"
  echo "  SKILL.md:     ${SKILL_VERSION}"
  echo ""
  echo "Bump SKILL.md's 'version:' field to match package.json, then commit both."
  exit 1
fi

echo "OK: SKILL.md version (${SKILL_VERSION}) matches package.json (${PKG_VERSION})."

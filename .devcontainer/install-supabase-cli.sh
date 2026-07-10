#!/usr/bin/env bash
set -euo pipefail

APP="supabase"
INSTALL_DIR="${SUPABASE_INSTALL_DIR:-/usr/local/bin}"
INSTALL_URL="https://raw.githubusercontent.com/supabase/cli/main/install"

if command -v "${APP}" >/dev/null 2>&1; then
  "${APP}" --version
  exit 0
fi

run_installer() {
  local install_dir="$1"
  curl -fsSL "${INSTALL_URL}" | bash -s -- --install-dir "${install_dir}" --no-modify-path
}

if [[ -w "${INSTALL_DIR}" || ( ! -e "${INSTALL_DIR}" && -w "$(dirname "${INSTALL_DIR}")" ) ]]; then
  mkdir -p "${INSTALL_DIR}"
  run_installer "${INSTALL_DIR}"
elif command -v sudo >/dev/null 2>&1; then
  sudo mkdir -p "${INSTALL_DIR}"
  curl -fsSL "${INSTALL_URL}" | sudo bash -s -- --install-dir "${INSTALL_DIR}" --no-modify-path
else
  fallback_dir="${HOME}/.supabase/bin"
  mkdir -p "${fallback_dir}"
  run_installer "${fallback_dir}"
  echo "${fallback_dir}" >>"${GITHUB_PATH:-/dev/null}" 2>/dev/null || true
  export PATH="${fallback_dir}:${PATH}"
fi

if ! command -v "${APP}" >/dev/null 2>&1; then
  echo "${APP} was installed but is not available in PATH." >&2
  exit 1
fi

"${APP}" --version

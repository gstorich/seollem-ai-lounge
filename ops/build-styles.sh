#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npx --yes --package=tailwindcss@3.4.17 tailwindcss --input styles/tailwind-input.css --output styles/app.css --content index.html --minify

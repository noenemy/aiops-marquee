#!/usr/bin/env bash
# AIOps Typography Rotation - 로컬 개발 서버 실행 스크립트
#
# 사용법:
#   ./serve.sh           # 기본 포트(8000)로 실행
#   ./serve.sh 8080      # 지정한 포트로 실행
#
# Requirement: 6.1 - 로컬 웹 서버를 통해 실행되며, 간단한 명령어 한 줄로 구동 가능하다.

set -e

PORT="${1:-8000}"

echo "Starting local server on http://localhost:${PORT}"
echo "Press Ctrl+C to stop."

python3 -m http.server "${PORT}"

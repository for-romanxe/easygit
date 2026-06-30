#!/usr/bin/env bash
# 쉬운깃 실행 스크립트
# 사용법: ./run.sh   (또는  bash run.sh)
set -e
cd "$(dirname "$0")"
echo "쉬운깃을 시작합니다... 잠시 후 http://localhost:8088 로 접속하세요."
mvn -q -DskipTests spring-boot:run

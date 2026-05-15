# Implementation Plan: AIOps Typography Rotation

## Overview

AWS Summit 데모 부스용 타이포그래피 로테이션 디스플레이 애플리케이션을 순수 HTML, CSS, JavaScript로 구현한다. 빌드 도구 없이 로컬 웹 서버에서 바로 실행 가능한 단일 페이지 애플리케이션으로, 각 모듈(MessageParser, RotationEngine, TransitionManager, FileWatcher, StyleManager)을 순차적으로 구현하고 통합한다.

## Tasks

- [x] 1. 프로젝트 구조 및 기본 HTML/CSS 설정
  - [x] 1.1 index.html 생성 - 풀스크린 레이아웃 구조
    - 전체 화면 모드 메타 태그 및 뷰포트 설정
    - Typography_Card 컨테이너 DOM 구조 정의
    - style.css 및 app.js 연결
    - _Requirements: 1.1, 1.3, 6.5_
  - [x] 1.2 style.css 생성 - 타이포그래피 및 레이아웃 스타일
    - 1920x1080 최적화 풀스크린 레이아웃
    - 대형 폰트 크기, 산세리프 폰트 스택 적용
    - 어두운 배경 + 밝은 텍스트 고대비 색상
    - AWS 브랜드 컬러(#FF9900, #232F3E) 강조 색상
    - 페이드인/페이드아웃 CSS transition 정의
    - 메인 텍스트/서브 텍스트 타이포그래피 스타일링(크기 변화, 굵기, 색상 대비)
    - _Requirements: 1.2, 1.3, 1.4, 3.2, 3.3, 5.1, 5.2, 5.3, 5.4_
  - [x] 1.3 serve.sh 생성 - 로컬 서버 실행 스크립트
    - `python -m http.server` 한 줄 명령어 스크립트
    - _Requirements: 6.1_

- [x] 2. MessageParser 모듈 구현
  - [x] 2.1 parseMessages 함수 구현
    - 빈 줄 기준 텍스트 분리 로직
    - 각 블록에서 첫 줄을 main, 두 번째 줄을 sub로 추출
    - 빈 블록 필터링 및 빈 입력 시 빈 배열 반환
    - _Requirements: 4.2, 4.3_
  - [x] 2.2 기본 폴백 메시지(DEFAULT_MESSAGES) 정의
    - 5개 이상의 AIOps 관련 홍보 문구 내장
    - _Requirements: 4.5, 4.6_
  - [ ]* 2.3 Property 1 테스트: 순환 인덱스 (Cyclic Index)
    - **Property 1: 순환 인덱스**
    - fast-check를 사용하여 nextIndex(currentIndex, totalMessages) === (currentIndex + 1) % totalMessages 검증
    - **Validates: Requirements 2.1, 2.3**
  - [ ]* 2.4 Property 2 테스트: 메시지 파싱 라운드트립 (Message Parsing Round-Trip)
    - **Property 2: 메시지 파싱 라운드트립**
    - 유효한 Message 배열을 직렬화 후 parseMessages로 파싱하면 원래 배열과 동일한 결과 검증
    - **Validates: Requirements 4.2, 4.3**

- [x] 3. RotationEngine 모듈 구현
  - [x] 3.1 nextIndex 함수 구현
    - 순환 인덱스 계산: (currentIndex + 1) % totalMessages
    - _Requirements: 2.1, 2.3_
  - [x] 3.2 start/stop 함수 구현
    - setTimeout 체인 기반 타이머 관리
    - 기본 8초 간격 표시
    - 페이지 로드 시 자동 시작
    - _Requirements: 2.2, 2.4_
  - [x] 3.3 updateMessages 함수 구현
    - 메시지 배열 업데이트 시 인덱스 유효성 보장
    - 더 짧은 배열로 업데이트 시 인덱스 리셋
    - _Requirements: 4.4_

- [x] 4. TransitionManager 모듈 구현
  - [x] 4.1 transitionTo 함수 구현
    - CSS opacity 기반 페이드아웃 → 콘텐츠 교체 → 페이드인
    - 전환 총 시간 1초 이내 (fadeOut 500ms + fadeIn 500ms)
    - 전환 중 빈 화면/깜빡임 방지
    - Promise 기반 전환 완료 알림
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 5. Checkpoint - 핵심 모듈 검증
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. StyleManager 모듈 구현
  - [x] 6.1 getCardStyle 함수 구현
    - 카드 인덱스에 따른 배경 그라데이션 생성
    - AWS 브랜드 컬러 기반 색상 팔레트 순환
    - 연속된 카드 간 서로 다른 배경 스타일 보장
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ]* 6.2 Property 4 테스트: 카드 스타일 다양성 (Card Style Diversity)
    - **Property 4: 카드 스타일 다양성**
    - totalCards >= 2일 때 연속된 두 인덱스의 getCardStyle 결과가 서로 다른 배경 스타일 반환 검증
    - **Validates: Requirements 5.3**

- [x] 7. FileWatcher 모듈 구현
  - [x] 7.1 startWatching/stopWatching 함수 구현
    - fetch 기반 주기적 polling (3초 간격)
    - 파일 내용 비교를 통한 변경 감지
    - 변경 감지 시 콜백 호출
    - fetch 실패 시 조용히 무시 (기존 메시지 유지)
    - _Requirements: 4.4, 6.2, 6.3_
  - [ ]* 7.2 Property 3 테스트: 로드 실패 시 폴백 보장 (Fallback on Load Failure)
    - **Property 3: 로드 실패 시 폴백 보장**
    - 오류 상황에서 메시지 로딩 시 항상 비어있지 않은 기본 Message_Set 반환 검증
    - **Validates: Requirements 4.6**

- [x] 8. 에러 핸들링 및 안정성 구현
  - [x] 8.1 글로벌 에러 핸들러 구현
    - window.onerror로 미처리 에러 캐치
    - unhandledrejection 이벤트 처리
    - 에러 발생 시 로테이션 자동 재시작
    - _Requirements: 6.3_
  - [x] 8.2 메모리 누수 방지 로직 구현
    - 새 타이머 설정 전 기존 타이머 clearTimeout
    - DOM 노드 재사용 (생성/삭제 반복 금지)
    - 파일 감시 시 이전 내용 참조 교체
    - _Requirements: 6.4_

- [x] 9. 통합 및 앱 초기화 로직 구현
  - [x] 9.1 app.js 메인 초기화 로직 작성
    - 모든 모듈 통합 (MessageParser, RotationEngine, TransitionManager, FileWatcher, StyleManager)
    - messages.txt 로드 → 파싱 → 로테이션 시작 흐름
    - 로드 실패 시 DEFAULT_MESSAGES 폴백
    - 페이지 로드 시 자동 로테이션 시작
    - _Requirements: 2.4, 4.1, 4.6, 6.2_
  - [x] 9.2 messages.txt 기본 데이터 파일 생성
    - 5개 이상의 AIOps 관련 홍보 문구 작성 (자동화, 모니터링, 장애 예측, 비용 최적화 등)
    - 빈 줄 구분자 형식 준수
    - 각 문구에 메인 텍스트 + 서브 텍스트 포함
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [x] 10. Checkpoint - 전체 통합 검증
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. 최종 검증 및 오프라인 동작 확인
  - [x] 11.1 오프라인 환경 동작 확인
    - 외부 네트워크 없이 로컬 서버만으로 정상 동작 확인
    - 시스템 폰트 스택으로 폰트 로딩 문제 없음 확인
    - _Requirements: 6.2, 6.5_
  - [ ]* 11.2 단위 테스트 작성
    - MessageParser 기본 파싱, sub 없는 메시지, 빈 입력 테스트
    - RotationEngine 시작/정지, 메시지 업데이트 테스트
    - FileWatcher 변경 감지/미변경 테스트
    - 기본 messages.txt 5개 이상 메시지 포함 확인
    - 에러 핸들러 동작 확인
    - _Requirements: 2.1, 2.3, 4.2, 4.3, 4.6, 6.3_

- [x] 12. Final checkpoint - 모든 테스트 통과 확인
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- `*` 표시된 태스크는 선택 사항이며 빠른 MVP를 위해 건너뛸 수 있습니다
- 각 태스크는 추적 가능성을 위해 특정 요구사항을 참조합니다
- 체크포인트는 점진적 검증을 보장합니다
- Property 테스트는 설계 문서의 Correctness Properties를 검증합니다
- 프로덕션 파일(index.html, style.css, app.js, messages.txt)은 빌드 없이 동작합니다
- 테스트(Jest, fast-check)는 개발/검증 목적으로만 사용됩니다

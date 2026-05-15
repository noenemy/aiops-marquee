# Requirements Document

## Introduction

AWS Summit 행사 데모 부스에서 스탠드형 TV에 AIOps 관련 홍보 문구를 타이포그래피 형식으로 로테이션하며 표시하는 웹 기반 디스플레이 애플리케이션. 행사 참관객의 시선을 끌고 AIOps 서비스의 핵심 가치를 효과적으로 전달하는 것이 목적이다.

## Glossary

- **Display_App**: 스탠드형 TV에서 실행되는 웹 기반 타이포그래피 로테이션 애플리케이션
- **Typography_Card**: 하나의 홍보 문구가 타이포그래피 스타일로 렌더링된 화면 단위
- **Rotation**: 여러 Typography_Card를 일정 간격으로 자동 전환하는 동작
- **Transition_Effect**: Typography_Card 간 전환 시 적용되는 시각적 애니메이션 효과
- **Message_Set**: Display_App에서 로테이션할 홍보 문구들의 집합

## Requirements

### Requirement 1: 홍보 문구 타이포그래피 표시

**User Story:** As a 데모 부스 운영자, I want 스탠드형 TV에 AIOps 홍보 문구를 타이포그래피 형식으로 표시하고 싶다, so that 행사 참관객의 시선을 끌고 핵심 메시지를 전달할 수 있다.

#### Acceptance Criteria

1. THE Display_App SHALL 전체 화면(Full Screen) 모드로 Typography_Card를 렌더링한다
2. THE Display_App SHALL 각 Typography_Card의 텍스트를 가독성 높은 대형 폰트 크기로 표시한다
3. THE Display_App SHALL 스탠드형 TV 해상도(1920x1080 이상)에 최적화된 레이아웃을 제공한다
4. THE Display_App SHALL 각 Typography_Card에 시각적 강조를 위한 타이포그래피 스타일링(폰트 크기 변화, 굵기, 색상 대비)을 적용한다

### Requirement 2: 자동 로테이션

**User Story:** As a 데모 부스 운영자, I want 홍보 문구가 자동으로 순환하며 표시되길 원한다, so that 별도의 조작 없이 지속적으로 메시지를 노출할 수 있다.

#### Acceptance Criteria

1. THE Display_App SHALL Message_Set의 Typography_Card를 순서대로 자동 로테이션한다
2. THE Display_App SHALL 각 Typography_Card를 기본 8초 동안 표시한 후 다음 카드로 전환한다
3. WHEN 마지막 Typography_Card 표시가 완료되면, THE Display_App SHALL 첫 번째 Typography_Card로 돌아가 무한 반복한다
4. THE Display_App SHALL 별도의 사용자 조작 없이 페이지 로드 시 자동으로 로테이션을 시작한다

### Requirement 3: 전환 애니메이션

**User Story:** As a 데모 부스 운영자, I want 문구 전환 시 부드러운 애니메이션 효과가 적용되길 원한다, so that 시각적으로 세련된 프레젠테이션을 제공할 수 있다.

#### Acceptance Criteria

1. WHEN Typography_Card가 전환될 때, THE Display_App SHALL Transition_Effect를 적용한다
2. THE Display_App SHALL 페이드인/페이드아웃 방식의 Transition_Effect를 기본으로 제공한다
3. THE Display_App SHALL 각 Transition_Effect의 지속 시간을 1초 이내로 완료한다
4. THE Display_App SHALL 전환 중 화면 깜빡임이나 빈 화면 없이 부드러운 전환을 보장한다

### Requirement 4: 홍보 문구 관리

**User Story:** As a 데모 부스 운영자, I want 표시할 홍보 문구를 별도 텍스트 파일로 관리하고 싶다, so that 행사 상황에 맞게 메시지를 쉽게 변경할 수 있다.

#### Acceptance Criteria

1. THE Display_App SHALL Message_Set을 별도의 텍스트 파일(messages.txt)에서 읽어온다
2. THE Display_App SHALL 텍스트 파일에서 각 홍보 문구를 구분자(빈 줄)로 분리하여 파싱한다
3. THE Display_App SHALL 각 홍보 문구에 대해 첫 번째 줄을 메인 텍스트로, 두 번째 줄을 서브 텍스트로 구분하여 표시한다
4. WHEN 텍스트 파일이 수정되면, THE Display_App SHALL 파일 변경을 감지하고 자동으로 Message_Set을 갱신하여 로테이션에 반영한다
5. THE Display_App SHALL 최소 5개 이상의 AIOps 관련 홍보 문구(자동화, 모니터링, 장애 예측, 비용 최적화 등)를 포함한 기본 messages.txt 파일을 제공한다
6. IF 텍스트 파일 로드에 실패하면, THEN THE Display_App SHALL 내장된 기본 Message_Set을 사용하여 로테이션을 계속한다

### Requirement 5: 시각적 디자인

**User Story:** As a 데모 부스 운영자, I want AWS 브랜드와 어울리는 세련된 디자인을 원한다, so that 전문적인 이미지를 전달할 수 있다.

#### Acceptance Criteria

1. THE Display_App SHALL 어두운 배경에 밝은 텍스트의 고대비 색상 조합을 사용한다
2. THE Display_App SHALL AWS 브랜드 컬러(오렌지 #FF9900, 다크 블루 #232F3E)를 강조 색상으로 활용한다
3. THE Display_App SHALL 각 Typography_Card마다 시각적 다양성을 위해 배경 그라데이션 또는 강조 색상을 변화시킨다
4. THE Display_App SHALL 깔끔하고 현대적인 산세리프 폰트를 사용한다

### Requirement 6: 안정적 운영

**User Story:** As a 데모 부스 운영자, I want 행사 기간 동안 중단 없이 안정적으로 동작하길 원한다, so that 부스 운영에 집중할 수 있다.

#### Acceptance Criteria

1. THE Display_App SHALL 로컬 웹 서버를 통해 실행되며, 간단한 명령어 한 줄로 구동 가능하다
2. THE Display_App SHALL 외부 네트워크 연결 없이 오프라인 환경에서 동작한다
3. IF 브라우저에서 JavaScript 오류가 발생하면, THEN THE Display_App SHALL 오류를 무시하고 로테이션을 계속한다
4. THE Display_App SHALL 8시간 이상 연속 실행 시에도 메모리 누수 없이 안정적으로 동작한다
5. THE Display_App SHALL HTML, CSS, JavaScript, 텍스트 파일로만 구성되어 별도 빌드 과정 없이 실행 가능하다

/**
 * AIOps Typography Rotation - Application Logic
 *
 * AWS Summit 데모 부스용 타이포그래피 로테이션 디스플레이 애플리케이션.
 *
 * 모듈 구조 (namespace 패턴):
 *   App.MessageParser - 메시지 파싱 및 기본 폴백 메시지
 *   App.RotationEngine - 로테이션 상태/타이머 관리 (setTimeout 체인)
 *   App.TransitionManager - 페이드 전환 애니메이션 (CSS opacity 기반)
 *   App.FileWatcher - messages.txt 변경 감지 (fetch polling)
 *   App.StyleManager - 카드별 스타일(배경 그라데이션 / 강조 색상) 생성·적용
 *   App.ErrorHandler - 글로벌 에러 핸들러 + 로테이션 자동 재시작
 *   App.init - 모든 모듈을 통합하는 메인 초기화 (DOMContentLoaded 자동 실행)
 */
(function (global) {
  'use strict';

  // 전역 namespace
  var App = global.App || {};

  // ---------------------------------------------------------------------------
  // MessageParser 모듈
  // ---------------------------------------------------------------------------
  var MessageParser = (function () {
    /**
     * 기본 폴백 메시지 (5개 이상의 AIOps 관련 한국어 홍보 문구).
     * messages.txt 로드 실패 또는 파싱 결과가 비어있을 때 사용한다.
     */
    var DEFAULT_MESSAGES = [
      {
        main: 'AI가 장애를 예측합니다',
        sub: '사후 대응에서 사전 예방으로'
      },
      {
        main: '운영 비용을 40% 절감',
        sub: '지능형 리소스 최적화'
      },
      {
        main: '24/7 자동 모니터링',
        sub: '사람이 놓치는 이상 징후를 AI가 감지'
      },
      {
        main: '평균 복구 시간 80% 단축',
        sub: '자동화된 인시던트 대응'
      },
      {
        main: '클라우드 운영의 미래',
        sub: 'AIOps로 시작하세요'
      },
      {
        main: '반복 운영 업무 자동화',
        sub: '엔지니어는 더 가치 있는 일에 집중'
      }
    ];

    /**
     * 원시 텍스트를 Message 배열로 파싱한다.
     *
     * 형식 규칙:
     *   - 메시지는 빈 줄(공백만 있는 줄 포함)을 구분자로 분리한다
     *   - 각 블록의 첫 번째 비어있지 않은 줄을 main으로 사용한다
     *   - 각 블록의 두 번째 비어있지 않은 줄을 sub로 사용한다 (없으면 빈 문자열)
     *   - main이 비어있는 블록은 결과에서 제외한다
     *   - 입력이 null/undefined/문자열이 아니거나 결과가 없으면 빈 배열을 반환한다
     *
     * @param {string} rawText - messages.txt 파일 원본 텍스트
     * @returns {Array<{main: string, sub: string}>} 파싱된 메시지 배열
     */
    function parseMessages(rawText) {
      if (typeof rawText !== 'string' || rawText.length === 0) {
        return [];
      }

      // 줄바꿈 정규화 (CRLF, CR -> LF) 후 줄 단위로 분리
      var lines = rawText.replace(/\r\n?/g, '\n').split('\n');

      var messages = [];
      var currentBlock = [];

      function flushBlock() {
        if (currentBlock.length === 0) {
          return;
        }
        var main = currentBlock[0];
        var sub = currentBlock.length > 1 ? currentBlock[1] : '';
        if (main && main.length > 0) {
          messages.push({ main: main, sub: sub });
        }
        currentBlock = [];
      }

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (line.length === 0) {
          // 빈 줄 = 블록 구분자
          flushBlock();
        } else {
          currentBlock.push(line);
        }
      }
      // 마지막 블록 처리 (파일이 빈 줄로 끝나지 않을 수 있음)
      flushBlock();

      return messages;
    }

    return {
      parseMessages: parseMessages,
      DEFAULT_MESSAGES: DEFAULT_MESSAGES
    };
  })();

  // ---------------------------------------------------------------------------
  // RotationEngine 모듈
  // ---------------------------------------------------------------------------
  var RotationEngine = (function () {
    /** 기본 카드 표시 간격 (ms) - Requirement 2.2 */
    var DEFAULT_INTERVAL_MS = 8000;

    /**
     * 새로운 RotationState 객체를 생성한다.
     *
     * design.md의 RotationState 인터페이스를 따른다:
     *   { messages, currentIndex, intervalMs, isRunning, timerId }
     *
     * @param {Array<{main:string,sub:string}>} messages - 표시할 메시지 배열
     * @param {number} [intervalMs] - 카드당 표시 시간 (ms). 기본 8000.
     * @returns {object} RotationState
     */
    function createState(messages, intervalMs) {
      return {
        messages: Array.isArray(messages) ? messages : [],
        currentIndex: 0,
        intervalMs:
          typeof intervalMs === 'number' && intervalMs > 0
            ? intervalMs
            : DEFAULT_INTERVAL_MS,
        isRunning: false,
        timerId: null
      };
    }

    /**
     * 다음 카드의 인덱스를 계산한다 (순환).
     *
     * 마지막 카드 다음에는 첫 번째 카드(0)로 순환한다.
     *   nextIndex(currentIndex, totalMessages) === (currentIndex + 1) % totalMessages
     *
     * 입력 검증:
     *   - totalMessages <= 0 이면 0 반환 (안전한 폴백)
     *   - currentIndex가 음수이거나 totalMessages 이상이면 모듈로 연산으로 정규화
     *
     * @param {number} currentIndex - 현재 카드 인덱스
     * @param {number} totalMessages - 전체 메시지 개수
     * @returns {number} 다음 카드 인덱스
     */
    function nextIndex(currentIndex, totalMessages) {
      if (
        typeof totalMessages !== 'number' ||
        !isFinite(totalMessages) ||
        totalMessages <= 0
      ) {
        return 0;
      }
      var n = Math.floor(totalMessages);
      var i = typeof currentIndex === 'number' && isFinite(currentIndex)
        ? Math.floor(currentIndex)
        : 0;
      // JavaScript의 % 연산자는 음수에 대해 음수를 반환할 수 있으므로 정규화
      var normalized = ((i % n) + n) % n;
      return (normalized + 1) % n;
    }

    /**
     * 로테이션 타이머를 시작한다.
     *
     * setTimeout 체인 기반으로 구현한다 (setInterval 대신):
     *   - 매 intervalMs마다 다음 카드로 인덱스를 진행하고 onTick 콜백을 호출한다
     *   - onTick 호출 후 다음 setTimeout을 예약하여 체인을 이어간다
     *   - 이미 실행 중이거나 메시지가 비어있으면 아무 동작도 하지 않는다
     *   - onTick 콜백은 (message, index)를 인자로 받는다 (TransitionManager 연결용)
     *
     * @param {object} state - RotationState
     * @param {function({main:string,sub:string}, number):void} [onTick] - 매 틱 콜백
     */
    function start(state, onTick) {
      if (!state || state.isRunning) {
        return;
      }
      if (!Array.isArray(state.messages) || state.messages.length === 0) {
        // 표시할 메시지가 없으면 시작하지 않는다
        return;
      }

      // 안전을 위해 기존 타이머가 남아있다면 정리
      if (state.timerId !== null) {
        clearTimeout(state.timerId);
        state.timerId = null;
      }

      state.isRunning = true;

      // 한 번의 틱: 다음 인덱스로 진행하고 콜백을 호출한 뒤 다음 틱을 예약한다.
      function tick() {
        // stop()이 먼저 호출되었거나 메시지가 비워졌으면 중단
        if (!state.isRunning) {
          state.timerId = null;
          return;
        }
        if (
          !Array.isArray(state.messages) ||
          state.messages.length === 0
        ) {
          state.timerId = null;
          state.isRunning = false;
          return;
        }

        state.currentIndex = nextIndex(
          state.currentIndex,
          state.messages.length
        );

        if (typeof onTick === 'function') {
          try {
            onTick(state.messages[state.currentIndex], state.currentIndex);
          } catch (err) {
            // onTick에서 예외가 발생해도 로테이션은 계속 진행한다
            // (글로벌 에러 핸들러가 별도로 처리)
            if (typeof console !== 'undefined' && console.warn) {
              console.warn('RotationEngine onTick error:', err);
            }
          }
        }

        // 다음 틱 예약 (setTimeout 체인)
        state.timerId = setTimeout(tick, state.intervalMs);
      }

      // 첫 번째 틱은 intervalMs 후에 발생한다.
      // (현재 인덱스의 카드는 호출자가 이미 화면에 표시한 상태로 가정)
      state.timerId = setTimeout(tick, state.intervalMs);
    }

    /**
     * 로테이션 타이머를 정지한다.
     *
     * 현재 예약된 setTimeout을 취소하고 isRunning 플래그를 false로 설정한다.
     * 이미 정지 상태라면 아무 동작도 하지 않는다.
     *
     * @param {object} state - RotationState
     */
    function stop(state) {
      if (!state) {
        return;
      }
      if (state.timerId !== null) {
        clearTimeout(state.timerId);
        state.timerId = null;
      }
      state.isRunning = false;
    }

    /**
     * 메시지 배열을 갱신하고 currentIndex의 유효성을 보장한다.
     *
     * - newMessages가 배열이 아니면 빈 배열로 처리
     * - 새 배열이 비어있으면 currentIndex를 0으로 리셋
     * - 새 배열의 길이보다 currentIndex가 크거나 같으면 0으로 리셋
     *   (Requirement 4.4: 더 짧은 배열로 업데이트 시 인덱스 리셋)
     * - 그 외에는 currentIndex를 유지하여 진행 중인 위치를 보존
     *
     * @param {object} state - RotationState
     * @param {Array<{main:string,sub:string}>} newMessages - 새 메시지 배열
     */
    function updateMessages(state, newMessages) {
      if (!state) {
        return;
      }
      var safeMessages = Array.isArray(newMessages) ? newMessages : [];
      state.messages = safeMessages;

      if (
        safeMessages.length === 0 ||
        state.currentIndex < 0 ||
        state.currentIndex >= safeMessages.length
      ) {
        state.currentIndex = 0;
      }
    }

    return {
      DEFAULT_INTERVAL_MS: DEFAULT_INTERVAL_MS,
      createState: createState,
      nextIndex: nextIndex,
      start: start,
      stop: stop,
      updateMessages: updateMessages
    };
  })();

  // ---------------------------------------------------------------------------
  // TransitionManager 모듈
  // ---------------------------------------------------------------------------
  var TransitionManager = (function () {
    /**
     * 기본 전환 설정값. 페이드아웃 + 페이드인 합계가 1초 이내가 되도록 한다.
     * (Requirement 3.3)
     */
    var DEFAULT_CONFIG = {
      fadeOutDuration: 500,
      fadeInDuration: 500
    };

    /**
     * 사용자가 지정한 config를 검증하고 기본값과 병합한다.
     * 음수나 숫자가 아닌 값은 기본값으로 대체한다.
     */
    function mergeConfig(config) {
      function pick(value, fallback) {
        return typeof value === 'number' && isFinite(value) && value >= 0
          ? value
          : fallback;
      }
      return {
        fadeOutDuration: pick(
          config && config.fadeOutDuration,
          DEFAULT_CONFIG.fadeOutDuration
        ),
        fadeInDuration: pick(
          config && config.fadeInDuration,
          DEFAULT_CONFIG.fadeInDuration
        )
      };
    }

    /**
     * 카드 컨테이너 내부의 #card-main, #card-sub 텍스트를 갱신한다.
     * opacity 0 상태에서 호출되어야 화면 깜빡임이 발생하지 않는다.
     */
    function applyMessage(container, message) {
      if (!container || !message || typeof container.querySelector !== 'function') {
        return;
      }
      var mainEl = container.querySelector('#card-main');
      var subEl = container.querySelector('#card-sub');
      if (mainEl) {
        mainEl.textContent = typeof message.main === 'string' ? message.main : '';
      }
      if (subEl) {
        subEl.textContent = typeof message.sub === 'string' ? message.sub : '';
      }
    }

    /**
     * 카드 스타일(배경 그라데이션 / 강조 색상)을 적용한다.
     *
     * App.StyleManager.applyCardStyle(container, colorIndex)을 위임 호출한다.
     * StyleManager가 아직 등록되지 않은 환경에서는 아무 동작도 하지 않는다
     * (조용한 폴백). StyleManager 호출 중 발생한 예외는 로깅 후 무시하여
     * 전환 애니메이션이 중단되지 않도록 한다.
     */
    function applyCardStyle(container, colorIndex) {
      if (!container || typeof colorIndex !== 'number') {
        return;
      }
      var styleManager = App.StyleManager;
      if (styleManager && typeof styleManager.applyCardStyle === 'function') {
        try {
          styleManager.applyCardStyle(container, colorIndex);
        } catch (err) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('TransitionManager applyCardStyle error:', err);
          }
        }
      }
    }

    /**
     * 컨테이너의 --fade-duration CSS 변수를 갱신하여 다음 transition의
     * 지속 시간을 제어한다. style.css의 .typography-card가 이 변수를 사용한다.
     */
    function setFadeDuration(container, durationMs) {
      if (
        container &&
        container.style &&
        typeof container.style.setProperty === 'function'
      ) {
        container.style.setProperty('--fade-duration', durationMs + 'ms');
      }
    }

    /**
     * 다음 애니메이션 프레임을 예약한다. requestAnimationFrame이 없는 환경
     * (예: 일부 테스트 러너) 에서는 setTimeout으로 폴백한다.
     */
    function nextFrame(callback) {
      if (typeof requestAnimationFrame === 'function') {
        return requestAnimationFrame(callback);
      }
      return setTimeout(callback, 0);
    }

    /**
     * 카드 콘텐츠를 부드럽게 교체한다.
     *
     *   1. 페이드아웃: 'is-fading' 클래스 추가 → opacity 1 → 0
     *   2. 콘텐츠 교체: opacity 0 상태에서 텍스트/스타일 갱신 (깜빡임 없음)
     *   3. 페이드인: 'is-fading' 클래스 제거 → opacity 0 → 1
     *
     * 전체 소요 시간은 fadeOutDuration + fadeInDuration이며 기본값 합계는
     * 1000ms로 Requirement 3.3 (전환 1초 이내)을 만족한다.
     *
     * @param {HTMLElement} container - .typography-card 요소
     * @param {{main:string, sub:string}} message - 표시할 메시지
     * @param {number} colorIndex - StyleManager에 전달할 카드 스타일 인덱스
     * @param {{fadeOutDuration?:number, fadeInDuration?:number}} [config]
     * @returns {Promise<void>} 페이드인 완료 시 resolve되는 Promise
     */
    function transitionTo(container, message, colorIndex, config) {
      var cfg = mergeConfig(config);

      return new Promise(function (resolve) {
        // 안전한 폴백: 컨테이너가 유효하지 않으면 콘텐츠만 교체하고 즉시 종료
        if (
          !container ||
          !container.classList ||
          typeof container.classList.add !== 'function'
        ) {
          try {
            applyMessage(container, message);
            applyCardStyle(container, colorIndex);
          } catch (err) {
            // 무시 - 호출자가 별도 에러 핸들러를 통해 처리
          }
          resolve();
          return;
        }

        // 1) 페이드아웃 단계: duration 설정 후 'is-fading' 클래스 추가
        setFadeDuration(container, cfg.fadeOutDuration);
        container.classList.add('is-fading');

        setTimeout(function () {
          // 2) opacity 0 상태에서 콘텐츠/스타일 교체 (사용자 눈에 보이지 않음)
          applyMessage(container, message);
          applyCardStyle(container, colorIndex);

          // 3) 페이드인 단계 준비: duration 변경
          setFadeDuration(container, cfg.fadeInDuration);

          // 다음 프레임에 클래스 제거하여 브라우저가 새 duration을 적용한
          // 상태에서 transition을 시작하도록 한다.
          nextFrame(function () {
            container.classList.remove('is-fading');

            setTimeout(function () {
              resolve();
            }, cfg.fadeInDuration);
          });
        }, cfg.fadeOutDuration);
      });
    }

    return {
      DEFAULT_CONFIG: DEFAULT_CONFIG,
      transitionTo: transitionTo
    };
  })();

  // ---------------------------------------------------------------------------
  // StyleManager 모듈
  // ---------------------------------------------------------------------------
  var StyleManager = (function () {
    /**
     * 카드별 배경 그라데이션 / 강조 색상 팔레트.
     *
     * 모든 항목은 어두운 배경 + 고대비 텍스트가 보장되도록 디자인되었으며,
     * AWS 브랜드 컬러(오렌지 #FF9900, 다크 블루 #232F3E)를 변주한다.
     * (Requirements 5.1, 5.2)
     *
     * 다양성을 위해 그라데이션 각도, 컬러 스톱, 강조 색상을 변형하였다.
     */
    var CARD_STYLES = [
      // 0: AWS 다크블루 → 짙은 네이비 (대각선)
      {
        background: 'linear-gradient(135deg, #232F3E 0%, #1a2332 100%)',
        accentColor: '#FF9900'
      },
      // 1: 짙은 네이비 → 거의 블랙 (수직)
      {
        background: 'linear-gradient(180deg, #1a2332 0%, #0d1117 100%)',
        accentColor: '#FF9900'
      },
      // 2: 다크블루 → 따뜻한 다크브라운 (대각선) - 오렌지 액센트와 조화
      {
        background: 'linear-gradient(135deg, #232F3E 0%, #2d1b00 100%)',
        accentColor: '#FFFFFF'
      },
      // 3: 거의 블랙 → 다크블루 (역방향 대각선)
      {
        background: 'linear-gradient(225deg, #0d1117 0%, #232F3E 100%)',
        accentColor: '#FF9900'
      },
      // 4: 라디얼 - 가운데 다크블루 발광
      {
        background:
          'radial-gradient(ellipse at center, #2a3a4f 0%, #0d1117 80%)',
        accentColor: '#FF9900'
      },
      // 5: 다크블루 → 어두운 오렌지 톤 (대각선)
      {
        background: 'linear-gradient(160deg, #1a2332 0%, #3a2410 100%)',
        accentColor: '#FF9900'
      },
      // 6: 깊은 블랙 → 다크블루 (수평)
      {
        background: 'linear-gradient(90deg, #0d1117 0%, #1f2a3c 100%)',
        accentColor: '#FFFFFF'
      }
    ];

    var PALETTE_SIZE = CARD_STYLES.length;

    /**
     * 두 CardStyle이 동일한 배경을 가리키는지 비교한다.
     */
    function sameBackground(a, b) {
      return !!a && !!b && a.background === b.background;
    }

    /**
     * 카드 인덱스에 대응하는 팔레트 슬롯을 계산한다.
     *
     * 일반적으로는 index % PALETTE_SIZE를 그대로 사용한다. 다만 totalCards가
     * PALETTE_SIZE보다 크고 totalCards % PALETTE_SIZE === 1인 경우에는
     * 순환 시 마지막 카드(n-1)가 첫 카드(0)와 같은 팔레트 슬롯을 갖게 되어
     * 연속된 (n-1, 0) 쌍의 배경이 동일해지는 문제가 발생한다.
     * 이를 방지하기 위해 마지막 카드는 직전 카드(n-2)와도, 첫 카드(0)와도
     * 다른 팔레트 슬롯으로 강제 이동시킨다. (Property 4)
     *
     * 또한 totalCards <= PALETTE_SIZE인 경우 인덱스를 그대로 사용하여
     * 가능한 모든 카드에 서로 다른 스타일이 부여되도록 한다.
     *
     * @param {number} index - 카드 인덱스 (>= 0)
     * @param {number} totalCards - 전체 카드 수 (>= 1)
     * @returns {number} CARD_STYLES 배열에 대한 팔레트 인덱스
     */
    function paletteSlot(index, totalCards) {
      // totalCards가 팔레트 크기 이하라면 그대로 사용 → 모든 카드 색상 고유
      if (totalCards <= PALETTE_SIZE) {
        return index % PALETTE_SIZE;
      }

      // 일반 케이스: 단순 모듈로
      var slot = index % PALETTE_SIZE;

      // wrap-around 충돌 보정:
      //   n % P === 1 이면 카드 (n-1)와 카드 0이 동일 슬롯을 갖는다.
      //   이때 카드 (n-1)을 다른 슬롯으로 옮긴다.
      if (totalCards % PALETTE_SIZE === 1 && index === totalCards - 1) {
        var slotZero = 0;                              // 카드 0의 슬롯
        var slotPrev = (totalCards - 2) % PALETTE_SIZE; // 카드 (n-2)의 슬롯
        // slotZero / slotPrev 둘 다와 다른 첫 슬롯을 선택
        for (var alt = 0; alt < PALETTE_SIZE; alt++) {
          if (alt !== slotZero && alt !== slotPrev) {
            return alt;
          }
        }
      }

      return slot;
    }

    /**
     * 카드 인덱스에 해당하는 CardStyle을 반환한다.
     *
     * design.md의 인터페이스:
     *   getCardStyle(index, totalCards) -> { background, accentColor }
     *
     * - 모든 결과는 어두운 배경 + AWS 브랜드 컬러를 사용한다 (Req 5.1, 5.2)
     * - 연속된 두 인덱스(순환 포함)의 배경은 항상 서로 다르다 (Req 5.3, Property 4)
     * - 입력이 비정상적이면 안전한 기본 스타일(슬롯 0)을 반환한다
     *
     * @param {number} index - 카드 인덱스
     * @param {number} totalCards - 전체 카드 수
     * @returns {{background: string, accentColor: string}} CardStyle
     */
    function getCardStyle(index, totalCards) {
      var n =
        typeof totalCards === 'number' && isFinite(totalCards) && totalCards > 0
          ? Math.floor(totalCards)
          : 1;
      var i =
        typeof index === 'number' && isFinite(index) ? Math.floor(index) : 0;
      // 음수 인덱스도 안전하게 정규화
      var normalized = ((i % n) + n) % n;
      var slot = paletteSlot(normalized, n);
      var base = CARD_STYLES[slot];
      // 새 객체로 복사하여 외부에서 변경해도 팔레트가 오염되지 않도록 한다
      return { background: base.background, accentColor: base.accentColor };
    }

    /**
     * 카드 컨테이너의 CSS 변수(--bg-gradient, --accent-color)를 갱신한다.
     *
     * style.css의 .typography-card는 이 변수들을 background와 ::before의
     * background-color로 사용하므로, 변수만 갱신하면 CSS transition을 통해
     * 부드럽게 새 스타일이 적용된다. (TransitionManager가 페이드 아웃된
     * 상태에서 호출하므로 깜빡임이 발생하지 않는다.)
     *
     * @param {HTMLElement} container - .typography-card 요소
     * @param {number} colorIndex - 카드 인덱스 (RotationEngine의 currentIndex)
     * @param {number} [totalCards] - 전체 카드 수.
     *   생략 시 colorIndex+1로 추정 (단일 카드 시나리오에서도 안전).
     */
    function applyCardStyle(container, colorIndex, totalCards) {
      if (
        !container ||
        !container.style ||
        typeof container.style.setProperty !== 'function'
      ) {
        return;
      }
      var n =
        typeof totalCards === 'number' && totalCards > 0
          ? totalCards
          : (typeof colorIndex === 'number' && colorIndex >= 0
              ? colorIndex + 1
              : 1);
      var style = getCardStyle(colorIndex, n);
      container.style.setProperty('--bg-gradient', style.background);
      container.style.setProperty('--accent-color', style.accentColor);
    }

    return {
      CARD_STYLES: CARD_STYLES,
      PALETTE_SIZE: PALETTE_SIZE,
      getCardStyle: getCardStyle,
      applyCardStyle: applyCardStyle,
      // 내부 유틸 (테스트 편의)
      _sameBackground: sameBackground,
      _paletteSlot: paletteSlot
    };
  })();

  // ---------------------------------------------------------------------------
  // FileWatcher 모듈
  // ---------------------------------------------------------------------------
  var FileWatcher = (function () {
    /** 기본 polling 간격 (ms) - design.md WatcherConfig 기본값 */
    var DEFAULT_POLL_INTERVAL_MS = 3000;

    /**
     * 모듈 로컬 watcher 상태.
     *
     * design.md의 watcherState 모델을 따른다:
     *   { lastContent, pollTimerId, pollIntervalMs, isWatching }
     *
     * 추가로 다음 필드를 포함한다:
     *   - url:        감시 중인 messages.txt 경로
     *   - onUpdate:   변경 감지 시 호출할 사용자 콜백
     *   - hasInitial: 첫 fetch 완료 여부 (true가 되어야 lastContent와 비교 시작)
     */
    var state = {
      url: '',
      lastContent: '',
      pollTimerId: null,
      pollIntervalMs: DEFAULT_POLL_INTERVAL_MS,
      isWatching: false,
      onUpdate: null,
      hasInitial: false
    };

    /**
     * 캐시를 우회하기 위해 URL에 cache-busting 쿼리 파라미터(t=timestamp)를
     * 부착한다. 기존 쿼리 파라미터가 있으면 '&', 없으면 '?'로 연결한다.
     *
     * 단순한 querystring 조작이지만, 정상적인 URL 형식이 아닐 수 있는 입력
     * (예: 빈 문자열, 잘못된 문자열) 도 폴백 처리하여 호출 자체가 throw되지
     * 않도록 한다.
     */
    function appendCacheBuster(url) {
      var safeUrl = typeof url === 'string' ? url : '';
      var separator = safeUrl.indexOf('?') >= 0 ? '&' : '?';
      return safeUrl + separator + 't=' + Date.now();
    }

    /**
     * 한 번의 polling 주기를 실행한다.
     *
     * 동작:
     *   1. cache-busting URL로 fetch (no-store cache 옵션 + 쿼리 파라미터 이중 보호)
     *   2. 응답이 ok가 아니면 조용히 무시 (다음 주기에 재시도)
     *   3. 응답 텍스트가 lastContent와 다르면 onUpdate 콜백 호출
     *   4. 첫 fetch는 lastContent를 저장만 하고 콜백을 호출하지 않음
     *   5. 어느 단계에서든 예외/거부가 발생하면 조용히 무시
     *   6. polling이 여전히 활성 상태라면 다음 fetch를 setTimeout으로 예약
     *
     * Requirement 6.3 (오류 무시) / 6.2 (오프라인 안정 동작)을 만족한다.
     */
    function pollOnce() {
      // stopWatching이 호출된 후 in-flight Promise resolve가 도착했을 때를 위해
      // 매 단계마다 isWatching을 다시 확인한다.
      if (!state.isWatching) {
        return;
      }
      if (typeof fetch !== 'function') {
        // fetch가 없는 환경 (구형 브라우저/일부 테스트 러너) - 조용히 종료.
        // 이 경우 polling 자체를 더 이어가지 않는다.
        return;
      }

      var requestUrl = appendCacheBuster(state.url);
      var fetchPromise;
      try {
        // cache: 'no-store' + 쿼리 파라미터 cache-busting 이중 보호
        fetchPromise = fetch(requestUrl, { cache: 'no-store' });
      } catch (err) {
        // 동기 throw도 조용히 무시하고 다음 주기 예약
        scheduleNext();
        return;
      }

      Promise.resolve(fetchPromise)
        .then(function (response) {
          if (!state.isWatching) {
            return null;
          }
          // 비정상 응답(404, 500 등)은 변경 감지 없이 다음 주기로 넘긴다.
          if (!response || !response.ok) {
            return null;
          }
          // .text()도 Promise를 반환하며 실패 가능 - 동일하게 무시 처리됨
          return response.text();
        })
        .then(function (text) {
          if (!state.isWatching || text === null || text === undefined) {
            return;
          }

          if (!state.hasInitial) {
            // 첫 fetch: 기준 콘텐츠로만 저장하고 콜백 호출 X
            state.lastContent = text;
            state.hasInitial = true;
            return;
          }

          if (text !== state.lastContent) {
            state.lastContent = text;
            if (typeof state.onUpdate === 'function') {
              try {
                state.onUpdate(text);
              } catch (cbErr) {
                // 사용자 콜백 예외는 watcher 자체를 멈추지 않도록 무시
                if (typeof console !== 'undefined' && console.warn) {
                  console.warn('FileWatcher onUpdate error:', cbErr);
                }
              }
            }
          }
        })
        .catch(function () {
          // 네트워크 오류/거부 등은 조용히 무시 (Req 6.3, 기존 메시지 유지)
        })
        .then(scheduleNext, scheduleNext);
    }

    /**
     * 다음 polling을 setTimeout으로 예약한다.
     * 이미 정지되었으면 예약하지 않는다.
     */
    function scheduleNext() {
      if (!state.isWatching) {
        return;
      }
      // 안전을 위해 기존 타이머가 남아있다면 정리
      if (state.pollTimerId !== null) {
        clearTimeout(state.pollTimerId);
        state.pollTimerId = null;
      }
      state.pollTimerId = setTimeout(pollOnce, state.pollIntervalMs);
    }

    /**
     * 파일 감시를 시작한다.
     *
     * design.md의 인터페이스:
     *   startWatching(config: WatcherConfig, onUpdate: (text) => void): void
     *   WatcherConfig = { url, pollIntervalMs (default 3000) }
     *
     * 동작 규칙:
     *   - url이 문자열이 아니거나 비어있으면 시작하지 않는다 (no-op).
     *   - 이미 감시 중이라면 기존 watcher를 정지한 뒤 새 설정으로 재시작한다.
     *   - 첫 polling은 pollIntervalMs 이후에 발생하며, 결과는 lastContent로
     *     저장만 하고 onUpdate를 호출하지 않는다.
     *   - 두 번째 이후 polling부터 lastContent와 다를 때만 onUpdate를 호출한다.
     *
     * @param {{url: string, pollIntervalMs?: number}} config
     * @param {function(string):void} onUpdate
     */
    function startWatching(config, onUpdate) {
      var url = config && typeof config.url === 'string' ? config.url : '';
      if (url.length === 0) {
        return;
      }

      // 기존 감시 정지 (재시작 시 타이머 누수 방지)
      stopWatching();

      var interval =
        config &&
        typeof config.pollIntervalMs === 'number' &&
        isFinite(config.pollIntervalMs) &&
        config.pollIntervalMs > 0
          ? config.pollIntervalMs
          : DEFAULT_POLL_INTERVAL_MS;

      state.url = url;
      state.pollIntervalMs = interval;
      state.onUpdate = typeof onUpdate === 'function' ? onUpdate : null;
      state.lastContent = '';
      state.hasInitial = false;
      state.isWatching = true;

      // 첫 polling을 interval 후에 예약 (즉시 실행하지 않음 - 호출자가 초기
      // 메시지 로딩을 별도로 수행하는 일반적인 사용 흐름을 방해하지 않기 위함).
      scheduleNext();
    }

    /**
     * 파일 감시를 정지하고 내부 상태를 초기화한다.
     *
     * 예약된 setTimeout을 clear하고 in-flight fetch는 resolve가 도착해도
     * isWatching === false 검사에 의해 무시되므로 메모리 누수가 발생하지
     * 않는다 (Req 6.4).
     */
    function stopWatching() {
      if (state.pollTimerId !== null) {
        clearTimeout(state.pollTimerId);
        state.pollTimerId = null;
      }
      state.isWatching = false;
      state.onUpdate = null;
      state.hasInitial = false;
      state.lastContent = '';
      // url / pollIntervalMs는 디버깅 편의를 위해 마지막 값을 유지해도 무방하나,
      // 명시적으로 초기화한다.
      state.url = '';
      state.pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
    }

    return {
      DEFAULT_POLL_INTERVAL_MS: DEFAULT_POLL_INTERVAL_MS,
      startWatching: startWatching,
      stopWatching: stopWatching,
      // 테스트 편의용 내부 접근 (외부에서 의존하지 말 것)
      _getState: function () {
        return state;
      }
    };
  })();

  // ---------------------------------------------------------------------------
  // ErrorHandler 모듈
  //
  // 글로벌 에러 핸들러 (window.onerror, unhandledrejection)를 등록하여
  // 미처리 에러로 인해 로테이션이 중단되는 것을 방지한다.
  //
  // 핵심 책임 (Requirement 6.3):
  //   - JavaScript 런타임 에러를 캐치하여 콘솔에 경고로 기록
  //   - Promise rejection이 무시되더라도 로테이션이 계속되도록 보장
  //   - 에러 발생 후 RotationEngine이 멈춘 상태라면 자동으로 재시작
  //
  // 메모리 누수 방지 (Requirement 6.4):
  //   - install() / setupErrorHandler()는 isSetup 플래그로 1회만 실행되도록 가드
  //   - 핸들러는 페이지 라이프사이클에 종속되므로 별도 해제는 불필요
  //   - 다른 모듈의 메모리 누수 방지는 각 모듈에서 처리:
  //     * RotationEngine.start/stop: 새 타이머 설정 전 clearTimeout (Req 6.4)
  //     * TransitionManager.transitionTo: #card-main / #card-sub 텍스트 노드 재사용
  //       (DOM 노드를 생성/삭제하는 대신 textContent만 갱신, Req 6.4)
  //     * FileWatcher: state.lastContent를 새 문자열로 교체하여 이전 참조 해제 (Req 6.4)
  // ---------------------------------------------------------------------------
  var ErrorHandler = (function () {
    /**
     * 모듈 로컬 상태.
     *  - rotationStateRef:   재시작 시 사용할 RotationState 참조
     *  - onTickRef:          재시작 시 사용할 onTick 콜백
     *  - transitionConfigRef: install() 호출 시 전달된 전환 설정 (참조 보관용)
     *  - isSetup:            window 핸들러 중복 등록 방지
     */
    var rotationStateRef = null;
    var onTickRef = null;
    var transitionConfigRef = null;
    var isSetup = false;

    /**
     * App.init이 RotationEngine.start를 호출하기 전 자신의 상태와 콜백을
     * ErrorHandler에 등록한다. 이후 에러 핸들러가 멈춘 로테이션을 재개할 때
     * 동일한 상태/콜백을 사용한다.
     *
     * @param {object} state  RotationEngine.createState로 만든 상태 객체
     * @param {function} onTick 매 틱에서 호출할 콜백 (TransitionManager 연결)
     */
    function trackRotation(state, onTick) {
      rotationStateRef = state || null;
      onTickRef = typeof onTick === 'function' ? onTick : null;
    }

    /**
     * 로테이션이 멈춘 경우에만 재시작을 시도한다.
     *
     * isRunning이 true라면 이미 동작 중이므로 재시작하지 않는다 (타이밍 교란
     * 방지). 메시지가 비어있으면 RotationEngine.start가 자체적으로 no-op
     * 처리하므로 추가 가드 없이 호출해도 안전하지만, 명시적으로 점검한다.
     */
    function attemptRestart() {
      if (!rotationStateRef) {
        return;
      }
      if (rotationStateRef.isRunning) {
        return;
      }
      if (
        !Array.isArray(rotationStateRef.messages) ||
        rotationStateRef.messages.length === 0
      ) {
        return;
      }
      try {
        RotationEngine.start(rotationStateRef, onTickRef);
      } catch (e) {
        // 재시작 자체에서도 예외가 나면 더 이상 시도하지 않는다 (무한 루프 방지)
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('ErrorHandler: rotation restart failed:', e);
        }
      }
    }

    /**
     * 에러 정보를 콘솔에 기록하고 로테이션 재시작을 시도하는 공통 처리.
     */
    function handleError(label, info) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[ErrorHandler] ' + label + ':', info);
      }
      attemptRestart();
    }

    /**
     * 글로벌 에러 핸들러를 등록한다.
     *
     * - window.onerror: 동기 런타임 에러 캐치, true 반환으로 기본 동작 억제
     * - unhandledrejection: 처리되지 않은 Promise rejection 캐치
     *
     * 이미 등록되어 있다면 다시 등록하지 않는다 (메모리 누수 방지).
     */
    function setupErrorHandler() {
      if (isSetup) {
        return;
      }
      if (typeof global === 'undefined' || global === null) {
        return;
      }
      // 브라우저(window)와 일부 테스트 환경 모두에서 동작
      var target = global;
      if (typeof target.addEventListener !== 'function') {
        return;
      }

      isSetup = true;

      // window.onerror - 기존 핸들러가 있다면 보존
      var prevOnError = typeof target.onerror === 'function' ? target.onerror : null;
      target.onerror = function (msg, url, lineNo, columnNo, error) {
        handleError('window.onerror', error || msg);
        if (prevOnError) {
          try {
            prevOnError.apply(this, arguments);
          } catch (_) {
            // 이전 핸들러 예외는 무시
          }
        }
        return true; // 에러 전파 억제 (Req 6.3)
      };

      // unhandledrejection - Promise 거부 캐치
      target.addEventListener('unhandledrejection', function (event) {
        handleError(
          'unhandledrejection',
          event && (event.reason || event)
        );
        if (event && typeof event.preventDefault === 'function') {
          event.preventDefault();
        }
      });
    }

    return {
      /**
       * 통합 설치 함수: 상태/콜백을 등록하고 글로벌 에러 핸들러까지 한 번에
       * 활성화한다. 메인 초기화에서 호출되는 권장 진입점이다.
       *
       *   ErrorHandler.install(rotationState, onTick, transitionConfig)
       *
       * 위 호출 한 번이면 다음이 모두 수행된다:
       *   1) 향후 재시작 시 사용할 state와 onTick 콜백 보관 (trackRotation)
       *   2) transitionConfig는 디버깅/확장 목적으로 보관만 한다
       *      (현재 재시작 경로는 RotationEngine.start만 호출하며 onTick 내부에서
       *       TransitionManager가 자체 기본 설정으로 동작한다)
       *   3) window.onerror / unhandledrejection 핸들러 등록 (setupErrorHandler)
       *
       * 다중 호출 시 setup은 isSetup 가드로 1회만 적용되어 핸들러 중복 등록과
       * 메모리 누수를 방지한다 (Req 6.4). state/onTick은 가장 최근 호출 값으로
       * 갱신된다.
       *
       * @param {object} rotationState    RotationEngine.createState 결과
       * @param {function} onTick         RotationEngine 매 틱 콜백
       * @param {object} [transitionConfig] TransitionManager용 설정 (선택)
       */
      install: function (rotationState, onTick, transitionConfig) {
        trackRotation(rotationState, onTick);
        transitionConfigRef = transitionConfig || null;
        setupErrorHandler();
      },
      setupErrorHandler: setupErrorHandler,
      // 별칭: 호출 측 편의
      setup: setupErrorHandler,
      trackRotation: trackRotation,
      // 테스트/디버깅 편의용 내부 노출
      _attemptRestart: attemptRestart,
      _isSetup: function () {
        return isSetup;
      },
      _getTransitionConfig: function () {
        return transitionConfigRef;
      }
    };
  })();

  // ---------------------------------------------------------------------------
  // App.init - 메인 초기화
  //
  // 모든 모듈을 통합하여 다음 흐름을 수행한다:
  //   1. .typography-card 컨테이너 획득
  //   2. messages.txt fetch → parseMessages
  //   3. 결과가 비어있으면 DEFAULT_MESSAGES로 폴백
  //   4. 첫 번째 카드를 즉시 화면에 표시 (페이드인)
  //   5. RotationEngine.createState로 상태 생성
  //   6. ErrorHandler에 상태 등록 후 setup
  //   7. RotationEngine.start (TransitionManager.transitionTo를 onTick으로)
  //   8. FileWatcher.startWatching으로 messages.txt 감시 시작
  //
  // Requirements: 2.4, 4.1, 4.6, 6.2
  // ---------------------------------------------------------------------------

  /** messages.txt 경로 (index.html과 같은 디렉토리에 위치) */
  var MESSAGES_URL = 'messages.txt';

  /**
   * 카드 컨테이너의 main / sub 텍스트 노드를 갱신한다.
   * DOM 노드를 재사용하여 메모리 누수를 방지한다 (Req 6.4).
   */
  function setCardContent(container, message) {
    if (!container || !message) {
      return;
    }
    var mainEl = container.querySelector('#card-main');
    var subEl = container.querySelector('#card-sub');
    if (mainEl) {
      mainEl.textContent = typeof message.main === 'string' ? message.main : '';
    }
    if (subEl) {
      subEl.textContent = typeof message.sub === 'string' ? message.sub : '';
    }
  }

  /**
   * messages.txt를 fetch하고 파싱한다. 어떤 단계에서든 실패하면 빈 배열을
   * 반환하며, 호출자는 빈 결과에 대해 DEFAULT_MESSAGES로 폴백해야 한다.
   *
   * @returns {Promise<Array<{main:string,sub:string}>>}
   */
  function loadMessagesFromFile(url) {
    if (typeof fetch !== 'function') {
      return Promise.resolve([]);
    }
    return fetch(url, { cache: 'no-store' })
      .then(function (response) {
        if (!response || !response.ok) {
          return '';
        }
        return response.text();
      })
      .catch(function () {
        return '';
      })
      .then(function (text) {
        return MessageParser.parseMessages(text || '');
      });
  }

  /**
   * 다음 프레임에 콜백을 실행한다. requestAnimationFrame이 없는 환경에서는
   * setTimeout으로 폴백한다.
   */
  function runNextFrame(callback) {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(callback);
    } else {
      setTimeout(callback, 0);
    }
  }

  /**
   * 메인 초기화 함수. DOMContentLoaded 시점에 자동 호출된다.
   * 외부에서 수동으로 호출해도 안전하다 (다중 호출 시 중복 watcher가
   * 생성될 수 있으므로 페이지 당 1회만 호출하는 것을 권장).
   */
  function init() {
    if (typeof document === 'undefined') {
      return;
    }

    var container =
      document.getElementById('typography-card') ||
      document.querySelector('.typography-card');
    if (!container) {
      // 컨테이너가 없으면 더 이상 진행할 수 없다
      return;
    }

    // 페이드인 효과를 위해 초기 상태를 opacity 0(.is-fading)로 시작
    container.classList.add('is-fading');

    loadMessagesFromFile(MESSAGES_URL).then(function (parsed) {
      // Requirement 4.6: 로드/파싱 실패 또는 빈 결과 시 DEFAULT_MESSAGES 폴백
      var messages =
        parsed && parsed.length > 0 ? parsed : MessageParser.DEFAULT_MESSAGES;

      // 1) 첫 번째 카드 즉시 표시 - 콘텐츠와 스타일을 opacity 0 상태에서 적용
      setCardContent(container, messages[0]);
      StyleManager.applyCardStyle(container, 0, messages.length);

      // 2) 다음 프레임에 페이드인 (브라우저가 적용된 콘텐츠를 인식한 뒤
      //    transition을 시작하여 첫 등장이 부드럽도록 함)
      runNextFrame(function () {
        container.classList.remove('is-fading');
      });

      // 3) RotationEngine 상태 생성
      var state = RotationEngine.createState(messages);

      // 4) onTick: 매 인터벌마다 TransitionManager로 부드럽게 전환
      function onTick(message, index) {
        // transitionTo는 Promise를 반환한다. 거부될 경우 글로벌 에러
        // 핸들러가 캐치하지 못할 수 있으므로 여기서 직접 무시한다.
        try {
          var p = TransitionManager.transitionTo(container, message, index);
          if (p && typeof p.then === 'function') {
            p.then(null, function (err) {
              if (typeof console !== 'undefined' && console.warn) {
                console.warn('TransitionManager error:', err);
              }
            });
          }
        } catch (err) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('TransitionManager threw:', err);
          }
        }
      }

      // 5) ErrorHandler에 상태/콜백 등록 후 글로벌 핸들러 setup
      //    install()은 trackRotation + setupErrorHandler를 한 번에 수행한다.
      //    (start 전에 호출해두어야 시작 직후 에러가 나도 재시작 가능)
      ErrorHandler.install(state, onTick, TransitionManager.DEFAULT_CONFIG);

      // 6) 로테이션 시작 (Req 2.4: 페이지 로드 시 자동 시작)
      RotationEngine.start(state, onTick);

      // 7) messages.txt 감시 시작 - 변경 시 RotationEngine.updateMessages 호출
      FileWatcher.startWatching(
        { url: MESSAGES_URL },
        function (newText) {
          var newMessages = MessageParser.parseMessages(newText);
          // 빈 결과로 갱신하면 로테이션이 멈출 수 있으므로 무시한다
          if (newMessages && newMessages.length > 0) {
            RotationEngine.updateMessages(state, newMessages);
          }
        }
      );
    });
  }

  /**
   * DOMContentLoaded에 init을 자동 등록한다.
   * 이미 DOM이 로드된 시점에 스크립트가 실행되었다면 즉시 init 실행.
   */
  function autoStart() {
    if (typeof document === 'undefined') {
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      // 이미 DOM이 준비됨 - 다음 틱에 실행하여 namespace 등록 후 동작 보장
      setTimeout(init, 0);
    }
  }

  // ---------------------------------------------------------------------------
  // namespace 등록 및 편의 export
  // ---------------------------------------------------------------------------
  App.MessageParser = MessageParser;
  App.RotationEngine = RotationEngine;
  App.TransitionManager = TransitionManager;
  App.StyleManager = StyleManager;
  App.FileWatcher = FileWatcher;
  App.ErrorHandler = ErrorHandler;
  App.init = init;

  // 편의를 위해 자주 쓰이는 심볼은 App 루트에도 노출
  App.parseMessages = MessageParser.parseMessages;
  App.DEFAULT_MESSAGES = MessageParser.DEFAULT_MESSAGES;

  global.App = App;

  // 브라우저 환경에서만 자동 시작 (테스트 환경에서는 수동으로 init 호출)
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    autoStart();
  }

  // CommonJS 환경(Jest 등 테스트)에서도 사용 가능하도록 export
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = App;
  }
})(typeof window !== 'undefined' ? window : globalThis);

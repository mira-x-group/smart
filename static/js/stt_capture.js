/* stt_capture.js
   Capture page STT bindings (NO KEEP)
   - 촬영 / 다시 / 다음(select 이동)
   - Uses MiraSTT (core) + MiraSTTParser (parser)
   - Uses MiraSTT.guard for safe execution
*/

(function (global) {
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  ready(function () {
    // --- Dependency checks ---
    if (!global.MiraSTT || !global.MiraSTT.isSupported) {
      console.warn("[STT Capture] MiraSTT not available or not supported.");
      return;
    }
    if (!global.MiraSTTParser) {
      console.warn("[STT Capture] MiraSTTParser not available.");
      return;
    }

    // --- Capture page elements (capture.js와 동일 id) ---
    const captureButton = document.getElementById("captureButton");
    const btnRecapture = document.getElementById("btnRecapture");
    const btnNext = document.getElementById("btnNext");

    // 버튼이 없으면(페이지 다르면) 조용히 종료
    if (!captureButton || !btnRecapture || !btnNext) {
      console.warn("[STT Capture] Required buttons not found. (captureButton/btnRecapture/btnNext)");
      return;
    }

    // --- Command keywords ---
    const KW_CAPTURE = ["촬영", "캡처", "찍어", "사진", "샷", "찍자"];
    const KW_RETAKE  = ["다시", "재촬영", "리셋", "되돌려", "처음으로"];
    const KW_NEXT    = ["다음", "넘어가", "셀렉", "선택", "옷선택", "select"];

    // 옵션: STT on/off (원하면 빼도 됨)
    const KW_STOP    = ["중지", "꺼", "멈춰", "스탑", "stop"];
    const KW_START   = ["시작", "켜", "듣기", "listen"];

    // --- Action helpers ---
    function clickIfEnabled(el) {
      if (!el) return false;
      if (el.disabled) return false;
      el.click();
      return true;
    }

    // "촬영"은 라이브 모드에서만 의미가 있음.
    function actionCapture() {
      // capture.js에서 captureButton.disabled면 카운트다운 중이라 무시하는 로직이 있음.
      clickIfEnabled(captureButton);
    }

    function actionRetake() {
      clickIfEnabled(btnRecapture);
    }

    function actionNext() {
      // 촬영 안 했으면 capture.js에서 alert 처리됨
      clickIfEnabled(btnNext);
    }

    // --- STT Start ---
    // 브라우저 정책상 자동 시작이 막힐 수 있어서 "첫 탭/클릭"으로 시작
    function startSTT() {
      global.MiraSTT.start(function (text) {
        // text는 이미 normalize(공백 제거)된 형태로 들어옴 (stt_core.js)
        if (!text) return;

        // on/off
        if (global.MiraSTTParser.hasKeyword(text, KW_STOP)) {
          global.MiraSTT.guard("cap_stt_stop", function () {
            global.MiraSTT.shouldBeListening = false;
            try { global.MiraSTT.recognition.stop(); } catch (e) {}
          });
          return;
        }

        if (global.MiraSTTParser.hasKeyword(text, KW_START)) {
          global.MiraSTT.guard("cap_stt_start", function () {
            global.MiraSTT.shouldBeListening = true;
            try { global.MiraSTT.recognition.start(); } catch (e) {}
          });
          return;
        }

        // main commands
        if (global.MiraSTTParser.hasKeyword(text, KW_CAPTURE)) {
          global.MiraSTT.guard("cap_capture", actionCapture);
          return;
        }

        if (global.MiraSTTParser.hasKeyword(text, KW_RETAKE)) {
          global.MiraSTT.guard("cap_retake", actionRetake);
          return;
        }

        if (global.MiraSTTParser.hasKeyword(text, KW_NEXT)) {
          global.MiraSTT.guard("cap_next", actionNext);
          return;
        }
      });
    }

    function oneTapToStart() {
      startSTT();
      document.removeEventListener("click", oneTapToStart);
      document.removeEventListener("touchstart", oneTapToStart);
      console.log("[STT Capture] started (one-tap)");
    }
    
// ✅ 촬영 버튼 클릭을 STT 시작 트리거로 사용
captureButton.addEventListener("click", function () {
  if (!window.__CAPTURE_STT_STARTED__) {
    startSTT();
    window.__CAPTURE_STT_STARTED__ = true;
    console.log("[STT Capture] started (by capture button)");
  }
}, { once: true });


    // (선택) 데스크탑에서 편하려면 키보드로도 시작 가능
    document.addEventListener("keydown", function (e) {
      if (e.key === "Enter") startSTT();
    });
  });
})(window);

/* select_stt.js
   Select 페이지 전용 음성 인식 (Web Speech API)
   - 1~6번 선택/취소
   - 1~6번 킵/취소
   - 킵시트 열기/닫기
   - 착용하기
   - KEEP 버튼
*/

(function () {
    // =====================================================
    // 1. STT Setup (Capture page pattern)
    // =====================================================
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    var stt = null;
    var sttBusy = false;
    var sttCooldownTimer = null;

    // Debugging Helper
    function log(msg) {
        console.log(`[SelectSTT] ${msg}`);
    }

    function initSTT() {
        if (!SpeechRecognition) {
            console.warn("[SelectSTT] Web Speech API not supported.");
            return;
        }

        stt = new SpeechRecognition();
        stt.lang = "ko-KR";
        stt.continuous = false;
        stt.interimResults = false;

        stt.onstart = function () {
            sttBusy = true;
            // log("Listening...");
        };

        stt.onresult = function (event) {
            var text = "";
            if (
                event &&
                event.results &&
                event.results[0] &&
                event.results[0][0] &&
                event.results[0][0].transcript
            ) {
                text = ("" + event.results[0][0].transcript).trim();
            }
            if (!text) return;
            handleVoiceCommand(text);
        };

        stt.onerror = function (e) {
            console.warn("[SelectSTT] Error:", e.error);
        };

        stt.onend = function () {
            sttBusy = false;
            scheduleSTT();
        };
    }

    function startSTT() {
        if (!stt || sttBusy) return;
        try {
            stt.start();
        } catch (e) {
            console.warn("[SelectSTT] Start failed:", e);
        }
    }

    function scheduleSTT() {
        if (sttCooldownTimer) clearTimeout(sttCooldownTimer);
        sttCooldownTimer = setTimeout(function () {
            startSTT();
        }, 600);
    }

    function normalize(text) {
        // 공백 제거, 구두점 제거
        return (text || "")
            .replace(/\s+/g, "")
            .replace(/[.,!?~。、“”"'’‘]/g, "")
            .toLowerCase(); // capture.js pattern + safety
    }

    // =====================================================
    // 2. Command Parsing Helpers
    // =====================================================

    // Number Parser (1~6)
    function parseNumber(text) {
        // 우선순위: "3번", "삼번" 등 명시적 표현 체크
        // 하지만 normalize로 인해 "3번" -> "3번" (공백없음)

        // 1) 숫자 매핑
        if (text.includes("1") || text.includes("일") || text.includes("한") || text.includes("첫")) return 1;
        if (text.includes("2") || text.includes("이") || text.includes("두")) return 2;
        if (text.includes("3") || text.includes("삼") || text.includes("세")) return 3;
        if (text.includes("4") || text.includes("사") || text.includes("네")) return 4;
        if (text.includes("5") || text.includes("오") || text.includes("다섯")) return 5;
        if (text.includes("6") || text.includes("육") || text.includes("여섯")) return 6;

        // 7,8은 비워두는 칸이므로 무시 (요구사항 1~6)
        return null;
    }

    // Check Helper
    function hasKeyword(target, keywords) {
        return keywords.some(k => target.includes(k));
    }

    // =====================================================
    // 3. Command Handler
    // =====================================================
    function handleVoiceCommand(raw) {
        const t = normalize(raw);
        console.log(`[SelectSTT] RAW: "${raw}" -> NORM: "${t}"`);

        // API Check
        if (!window.selectAPI) {
            console.warn("[SelectSTT] selectAPI not found. Aborting command.");
            return;
        }

        // (5) 착용하기 / 가상피팅
        if (hasKeyword(t, ["착용", "입혀", "입어", "피팅", "시작"])) {
            log("Cmd: Try On");
            window.selectAPI.tryOn();
            return;
        }

        // (6) KEEP 버튼 (최우선) vs (3) 킵시트 열기
        // "킵 버튼 눌러", "KEEP 눌러", "킵 열어" 
        // "킵시트 열어" -> (3)
        // 애매함 방지: "버튼"이 들어가면 (6)
        if (hasKeyword(t, ["킵버튼", "keep버튼", "찜버튼", "보관함버튼"])) {
            log("Cmd: Press Keep Button");
            window.selectAPI.openKeepPopup();
            return;
        }

        // (3) 킵시트 열어
        if (hasKeyword(t, ["킵시트열어", "찜시트열어", "목록열어", "보관함열어", "목록보여줘", "킵목록", "찜목록"])) {
            log("Cmd: Open Sheet");
            window.selectAPI.openKeepSheet();
            return;
        }
        // "킵 열어", "찜 열어" -> 버튼인지 시트인지? 
        // 요구사항 (6) "킵 열어" => KEEP 버튼. So prioritize Button fallback if "버튼" word missing but intent is clear?
        // User req: "킵 열어" -> KEEP 버튼.
        if (t === "킵열어" || t === "찜열어") {
            log("Cmd: Open (Ambiguous -> Keep Button)");
            window.selectAPI.openKeepPopup();
            return;
        }

        // (4) 킵시트 닫아
        if (hasKeyword(t, ["킵시트닫아", "찜시트닫아", "목록닫아", "보관함닫아", "접어", "꺼"])) {
            log("Cmd: Close Sheet");
            window.selectAPI.closeKeepSheet();
            return;
        }


        // (1) & (2) Numbered Commands
        const num = parseNumber(t);
        if (num !== null) {
            // (2) KEEP / UNKEEP
            // "킵", "찜", "하트", "담아", "저장", "추가" -> Toggle Keep (Add)
            // "빼", "삭제", "해제", "취소" -> Toggle Keep (Remove)
            // 로직상 toggleKeep 하나로 처리.
            // But need to distinguish "Select Cancel" vs "Keep Cancel"

            // CASE: Keep Logic
            if (hasKeyword(t, ["킵", "찜", "하트", "담아", "저장"])) {
                log(`Cmd: Keep #${num}`);
                window.selectAPI.toggleKeep(num);
                return;
            }

            // CASE: Select Logic
            // "선택", "골라", "보여줘", "프리뷰", "확인"
            if (hasKeyword(t, ["선택", "골라", "보여줘", "프리뷰", "확인"])) {
                log(`Cmd: Select #${num}`);
                window.selectAPI.toggleSelect(num);
                return;
            }

            // CASE: Cancel / Remove (Ambiguous)
            // "취소", "해제", "빼"
            // Context: "킵 취소" vs "선택 취소"
            // If "킵취소", "찜취소", "하트취소" -> Keep Toggle
            if (hasKeyword(t, ["킵취소", "찜취소", "하트취소"])) {
                log(`Cmd: Keep Cancel #${num}`);
                window.selectAPI.toggleKeep(num);
                return;
            }

            // If "선택취소", "선택해제" -> Select Toggle
            if (hasKeyword(t, ["선택취소", "선택해제"])) {
                log(`Cmd: Select Cancel #${num}`);
                window.selectAPI.toggleSelect(num);
                return;
            }

            // Just "취소", "빼", "해제", "삭제" -> 
            // User req: 
            // (1) "취소/해제/빼..." -> Select Cancel
            // (2) "빼/삭제/해제" -> Keep Cancel 
            // "빼", "해제" overlap. 
            // Strategy: If explicit "선택" or "킵" not present, maybe default to Select?
            // Wait, "빼" is strongly associated with "Keep Remove".
            // "취소" is strongly associated with "Select Cancel" (in context of "Select").

            if (hasKeyword(t, ["삭제"])) {
                // "삭제" -> Keep Remove likely
                log(`Cmd: Keep Toggle (Remove intent) #${num}`);
                window.selectAPI.toggleKeep(num);
                return;
            }

            // "취소", "해제", "빼" -> Default to Select Toggle per (1)? 
            // Or check current state? STT shouldn't know state deep.
            // Let's follow "Select" priority for "취소/해제", "Keep" for "빼"?
            // (1) "n번 취소/해제/빼..." -> Select Cancel
            // (2) "n번 ... 빼/삭제/해제" -> Keep Cancel
            // "빼" is in both. 
            // Let's assume "빼" = Keep Toggle (handling 'removing from cart' mental model).
            // "취소", "해제" = Select Toggle.

            if (hasKeyword(t, ["빼"])) {
                log(`Cmd: Keep Toggle (Remove intent) #${num}`);
                window.selectAPI.toggleKeep(num);
                return;
            }

            if (hasKeyword(t, ["취소", "해제"])) {
                log(`Cmd: Select Toggle (Cancel intent) #${num}`);
                window.selectAPI.toggleSelect(num);
                return;
            }
        }
    }


    // =====================================================
    // 4. Start
    // =====================================================
    initSTT();

    // Page Load Delay
    window.addEventListener("load", function () {
        setTimeout(function () {
            scheduleSTT();
        }, 800);
    });

})();

/* result_stt.js
   Result 페이지 전용 음성 인식 (Web Speech API)
   - 킵시트 열기/닫기
   - 셀렉으로 돌아가기
   - KEEP 버튼 누르기
   - 목록에서 n번 킵 취소/삭제
*/

(function () {
    // =====================================================
    // 1. STT Setup (Reused Pattern)
    // =====================================================
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    var stt = null;
    var sttBusy = false;
    var sttCooldownTimer = null;

    function log(msg) {
        console.log(`[ResultSTT] ${msg}`);
    }

    function initSTT() {
        if (!SpeechRecognition) {
            console.warn("[ResultSTT] Web Speech API not supported.");
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
            console.warn("[ResultSTT] Error:", e.error);
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
            console.warn("[ResultSTT] Start failed:", e);
        }
    }

    function scheduleSTT() {
        if (sttCooldownTimer) clearTimeout(sttCooldownTimer);
        sttCooldownTimer = setTimeout(function () {
            startSTT();
        }, 600);
    }

    function normalize(text) {
        // 공백/구두점 제거 + 소문자
        return (text || "")
            .replace(/\s+/g, "")
            .replace(/[.,!?~。、“”"'’‘]/g, "")
            .toLowerCase();
    }

    // =====================================================
    // 2. Command Parsing Helpers
    // =====================================================

    // Number Parser (1~6)
    function parseNumber(text) {
        if (text.includes("1") || text.includes("일") || text.includes("한") || text.includes("첫")) return 1;
        if (text.includes("2") || text.includes("이") || text.includes("두")) return 2;
        if (text.includes("3") || text.includes("삼") || text.includes("세")) return 3;
        if (text.includes("4") || text.includes("사") || text.includes("네")) return 4;
        if (text.includes("5") || text.includes("오") || text.includes("다섯")) return 5;
        if (text.includes("6") || text.includes("육") || text.includes("여섯")) return 6;
        return null;
    }

    function hasKeyword(target, keywords) {
        return keywords.some((k) => target.includes(k));
    }

    // =====================================================
    // 3. Command Handler
    // =====================================================
    function handleVoiceCommand(raw) {
        const t = normalize(raw);
        console.log(`[ResultSTT] RAW: "${raw}" -> NORM: "${t}"`);

        // (1) 킵시트 열기 / 닫기
        // Open
        if (hasKeyword(t, ["킵시트열어", "찜시트열어", "목록열어", "보관함열어", "킵목록", "찜목록"])) {
            log("Cmd: Open Sheet");
            window.keepSheet?.openPanel();
            return;
        }
        // Close
        if (hasKeyword(t, ["킵시트닫아", "찜시트닫아", "목록닫아", "보관함닫아", "접어", "꺼"])) {
            log("Cmd: Close Sheet");
            window.keepSheet?.closePanel();
            return;
        }

        // (2) "셀렉으로 돌아가기"
        if (hasKeyword(t, ["셀렉오로", "셀렉으로", "선택화면", "선택으로", "뒤로가기", "이전", "돌아가기"])) {
            log("Cmd: Return to Select");
            const btnBack = document.getElementById("btnBack");
            if (btnBack) {
                btnBack.click();
            } else {
                // Fallback search text
                const btns = document.querySelectorAll("button");
                const target = Array.from(btns).find(
                    b => b.textContent && (b.textContent.includes("셀렉") || b.textContent.includes("선택") || b.textContent.includes("돌아가"))
                );
                if (target) {
                    target.click();
                } else {
                    // Last fallback
                    window.location.href = "/select";
                }
            }
            return;
        }

        // (3) 킵시트 안의 "KEEP" 버튼
        // "KEEP 눌러", "킵 버튼 눌러", "keep 버튼", "KEEP 실행", "킵 실행"
        if (hasKeyword(t, ["keep눌러", "킵버튼", "keep버튼", "킵실행", "keep실행"])) {
            log("Cmd: Press Keep Button");
            // Try precise class first
            let btn = document.querySelector(".btn-keep") || document.getElementById("keepButton");
            if (btn) {
                btn.click();
            } else {
                console.warn("[ResultSTT] Keep button not found");
            }
            return;
        }

        // (4) 킵 목록 n번 취소
        // "n번 킵 취소", "n번 찜 취소", "n번 하트 취소", "n번 삭제", "n번 빼", "n번 제거", "n번 해제"
        const num = parseNumber(t);
        if (num !== null) {
            if (hasKeyword(t, ["취소", "삭제", "빼", "제거", "해제"])) {
                log(`Cmd: Remove Item #${num}`);
                removeKeepItemByIndex(num);
                return;
            }
        }
    }

    // Helper: Remove item by index (1-based) from the panel
    function removeKeepItemByIndex(index) {
        if (!window.keepSheet) return;

        const panelList = document.getElementById("panelList");
        if (!panelList) return;

        const items = panelList.querySelectorAll(".panel-item");
        if (!items || items.length === 0) {
            console.warn("[ResultSTT] Panel empty");
            return;
        }

        const targetItem = items[index - 1]; // 0-based index
        if (targetItem) {
            const source = targetItem.dataset.source;
            if (source) {
                window.keepSheet.removeFromPanelBySource(source);
                log(`Removed item #${index} (${source})`);
            } else {
                // Try clicking remove button if source missing?
                const btn = targetItem.querySelector(".panel-item-remove");
                if (btn) btn.click();
            }
        } else {
            console.warn(`[ResultSTT] Item #${index} not found in panel`);
        }
    }

    // =====================================================
    // 4. Start
    // =====================================================
    initSTT();

    window.addEventListener("load", function () {
        setTimeout(function () {
            scheduleSTT();
        }, 800);
    });

})();

/* select_stt.js */
(function () {
    const Parser = window.MiraSTTParser;
    const STT = window.MiraSTT;

    if (!STT || !STT.isSupported || !Parser) {
        console.warn("[SelectSTT] Missing STT dependencies.");
        return;
    }

    function handleVoiceCommand(t) {
        if (!window.selectAPI) return;

        // (5) Try On
        if (Parser.hasKeyword(t, ["착용", "입혀", "입어", "피팅", "시작"])) {
            STT.guard("try_on", () => window.selectAPI.tryOn());
            return;
        }

        // (6) Keep Button
        if (Parser.hasKeyword(t, ["킵버튼", "keep버튼", "찜버튼", "보관함버튼"])) {
            STT.guard("keep_btn", () => window.selectAPI.openKeepPopup());
            return;
        }

        // (3) Keep Sheet Open
        if (Parser.hasKeyword(t, ["킵시트열어", "찜시트열어", "목록열어", "보관함열어", "목록보여줘", "킵목록", "찜목록"]) ||
            t === "킵열어" || t === "찜열어") {
            STT.guard("sheet_open", () => window.selectAPI.openKeepSheet());
            return;
        }

        // (4) Keep Sheet Close
        if (Parser.hasKeyword(t, ["킵시트닫아", "찜시트닫아", "목록닫아", "보관함닫아", "접어", "꺼"])) {
            STT.guard("sheet_close", () => window.selectAPI.closeKeepSheet());
            return;
        }

        // Numbered Commands
        const num = Parser.parseNumber(t);
        if (num !== null) {
            // Keep Toggle
            if (Parser.hasKeyword(t, ["킵", "찜", "하트", "담아", "저장"])) {
                STT.guard(`keep_toggle_${num}`, () => window.selectAPI.toggleKeep(num));
                return;
            }

            // Select Toggle
            if (Parser.hasKeyword(t, ["선택", "골라", "보여줘", "프리뷰", "확인"])) {
                STT.guard(`select_toggle_${num}`, () => window.selectAPI.toggleSelect(num));
                return;
            }

            // Keep Cancel related
            if (Parser.hasKeyword(t, ["킵취소", "찜취소", "하트취소", "삭제", "빼"])) {
                STT.guard(`keep_toggle_${num}`, () => window.selectAPI.toggleKeep(num));
                return;
            }

            // Select Cancel related
            if (Parser.hasKeyword(t, ["선택취소", "선택해제", "취소", "해제"])) {
                STT.guard(`select_toggle_${num}`, () => window.selectAPI.toggleSelect(num));
                return;
            }
        }
    }

    // Init
    setTimeout(() => {
        STT.start(handleVoiceCommand);
    }, 800);

})();

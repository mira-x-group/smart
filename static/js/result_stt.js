/* result_stt.js */
(function () {
    const Parser = window.MiraSTTParser;
    const STT = window.MiraSTT;

    if (!STT || !STT.isSupported || !Parser) {
        console.warn("[ResultSTT] Missing STT dependencies.");
        return;
    }

    // Internal helper reuse
    function removeKeepItemByIndex(index) {
        if (!window.keepSheet) return;
        const panelList = document.getElementById("panelList");
        if (!panelList) return;
        const items = panelList.querySelectorAll(".panel-item");
        if (items && items[index - 1]) {
            const target = items[index - 1];
            const source = target.dataset.source;
            if (source) window.keepSheet.removeFromPanelBySource(source);
            else target.querySelector(".panel-item-remove")?.click();
        }
    }

    function handleVoiceCommand(t) {
        // (1) Sheet Open
        if (Parser.hasKeyword(t, ["킵시트열어", "찜시트열어", "목록열어", "보관함열어", "킵목록", "찜목록"])) {
            STT.guard("sheet_open", () => window.keepSheet?.openPanel());
            return;
        }
        // Sheet Close
        if (Parser.hasKeyword(t, ["킵시트닫아", "찜시트닫아", "목록닫아", "보관함닫아", "접어", "꺼"])) {
            STT.guard("sheet_close", () => window.keepSheet?.closePanel());
            return;
        }

        // (2) Back to Select
        if (Parser.hasKeyword(t, ["셀렉오로", "셀렉으로", "선택화면", "선택으로", "뒤로가기", "이전", "돌아가기"])) {
            STT.guard("nav_back", () => {
                const btn = document.getElementById("btnBack");
                if (btn) btn.click();
                else window.location.href = "/select";
            });
            return;
        }

        // (3) Keep Button
        if (Parser.hasKeyword(t, ["keep눌러", "킵버튼", "keep버튼", "킵실행", "keep실행"])) {
            STT.guard("keep_btn", () => {
                const btn = document.querySelector(".btn-keep") || document.getElementById("keepButton");
                if (btn) btn.click();
            });
            return;
        }

        // (4) Cancel Keep #n
        const num = Parser.parseNumber(t);
        if (num !== null) {
            if (Parser.hasKeyword(t, ["취소", "삭제", "빼", "제거", "해제"])) {
                STT.guard(`item_remove_${num}`, () => removeKeepItemByIndex(num));
                return;
            }
        }
    }

    // Init
    setTimeout(() => {
        STT.start(handleVoiceCommand);
    }, 800);

})();

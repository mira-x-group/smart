/* stt_parser.js
   Shared parsing logic for Mira X STT
   - Number parsing (1~6 + Korean numerals)
   - Keyword matching utility
*/

(function (global) {
    global.MiraSTTParser = {
        // Parse 1~6 from text
        parseNumber: function (text) {
            if (!text) return null;
            if (text.includes("1") || text.includes("일") || text.includes("한") || text.includes("첫")) return 1;
            if (text.includes("2") || text.includes("이") || text.includes("두")) return 2;
            if (text.includes("3") || text.includes("삼") || text.includes("세")) return 3;
            if (text.includes("4") || text.includes("사") || text.includes("네")) return 4;
            if (text.includes("5") || text.includes("오") || text.includes("다섯")) return 5;
            if (text.includes("6") || text.includes("육") || text.includes("여섯")) return 6;
            if (text.includes("7") || text.includes("칠") || text.includes("일곱")) return 6;
            if (text.includes("8") || text.includes("팔") || text.includes("여덟")) return 6;
            return null;
        },

        // Check if any keyword exists in text
        hasKeyword: function (text, keywords) {
            if (!text || !keywords) return false;
            return keywords.some(k => text.includes(k));
        }
    };
})(window);

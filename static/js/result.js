/* static/js/result.js
   Result 페이지 전용
   - 결과 이미지 표시 (#resultImg)
   - 셀렉으로 돌아가기 (쿼리 파라미터 유지)
   - 킵시트 로직은 keep_sheet.js가 처리
*/
(() => {
  const resultImg = document.getElementById("resultImg");
  const btnBack = document.getElementById("btnBack");

  // -----------------------------
  // 1) 결과 이미지 주입
  // -----------------------------
  function normalizeUrl(raw) {
    if (!raw) return null;

    // 이미 절대 URL이면 그대로
    if (/^https?:\/\//i.test(raw)) return raw;

    // "/static/..." 같은 절대 경로면 origin 붙임
    if (raw.startsWith("/")) return window.location.origin + raw;

    // "static/..." 같은 상대 경로면 "/" 붙여서 처리
    if (raw.startsWith("static/")) return window.location.origin + "/" + raw;

    // 그 외는 그대로(쿼리로 넘어오는 경우가 많아서)
    return raw;
  }

  function setResultImage(rawUrl) {
    if (!resultImg) return;
    const url = normalizeUrl(rawUrl);
    if (!url) return;

    // 캐시 방지 (방금 생성된 결과가 안 바뀌는 경우 대비)
    const u = new URL(url, window.location.origin);
    u.searchParams.set("_t", Date.now().toString());

    resultImg.style.display = "block";
    resultImg.src = u.toString();
  }

  // 우선순위: querystring → window 전역(서버가 내려줄 경우)
  const qs = new URLSearchParams(window.location.search);
  const imgParam =
    qs.get("image") ||
    qs.get("image_url") ||
    qs.get("result_url") ||
    qs.get("resultUrl");

  if (imgParam) {
    setResultImage(imgParam);
  } else if (window.RESULT_IMAGE_URL) {
    setResultImage(window.RESULT_IMAGE_URL);
  }
  // (여기서 더 필요하면: "현재 세션의 최신 결과 API" 호출을 추가하면 됨)

  // -----------------------------
  // 2) 셀렉으로 돌아가기 (세션/미러 파라미터 유지)
  // -----------------------------
  if (btnBack) {
    btnBack.addEventListener("click", () => {
      const cur = new URL(window.location.href);

      const sessionId =
        cur.searchParams.get("session_id") ||
        cur.searchParams.get("sessionId") ||
        cur.searchParams.get("sid");

      const mirrorId =
        cur.searchParams.get("mirror_id") ||
        cur.searchParams.get("mirrorId") ||
        cur.searchParams.get("mid");

      const next = new URL("/select", window.location.origin);
      if (sessionId) next.searchParams.set("session_id", sessionId);
      if (mirrorId) next.searchParams.set("mirror_id", mirrorId);

      window.location.href = next.toString();
    });
  }
})();

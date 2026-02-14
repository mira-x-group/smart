(async function () {
  // ✅ session_id / mirror_id: URL 파라미터 or window 전역(loading.html에서 주입)
  const params = new URLSearchParams(window.location.search);
  const SESSION_ID = (params.get("session_id") || window.SESSION_ID || "").trim();
  const MIRROR_ID = (params.get("mirror_id") || window.MIRROR_ID || "").trim();

  // ✅ 공통 이동 함수: 항상 파라미터 유지
  function goSelect() {
    const qs = [];
    if (SESSION_ID) qs.push("session_id=" + encodeURIComponent(SESSION_ID));
    if (MIRROR_ID) qs.push("mirror_id=" + encodeURIComponent(MIRROR_ID));
    window.location.href = "/select" + (qs.length ? "?" + qs.join("&") : "");
  }

  function goResult(imageUrl) {
    const qs = [];
    if (SESSION_ID) qs.push("session_id=" + encodeURIComponent(SESSION_ID));
    if (MIRROR_ID) qs.push("mirror_id=" + encodeURIComponent(MIRROR_ID));
    qs.push("image=" + encodeURIComponent(imageUrl));
    window.location.href = "/result?" + qs.join("&");
  }

  try {
    // ✅ (기존 그대로) sessionStorage에서 선택된 옷 정보 가져오기
    const top = sessionStorage.getItem("tryon_top") || "";
    const bottom = sessionStorage.getItem("tryon_bottom") || "";

    if (!top && !bottom) {
      alert("옷 선택 정보가 없습니다.");
      goSelect(); // ✅ session 유지
      return;
    }

    // ✅ (기존 그대로) tryonData 형태
    const tryonData = { top: top || null, bottom: bottom || null };

    // ✅ 사용자 이미지 업로드 (기존 그대로)
    const capturedImage = localStorage.getItem("capturedImage");
    if (capturedImage) {
      await fetch("/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: capturedImage }),
        credentials: "include"
      });
    }

    // ✅ (기존 그대로) "/static/..." 그대로 보냄
    const topPath = tryonData.top || null;
    const bottomPath = tryonData.bottom || null;

    // ✅ Try-on API 호출 (기존 그대로)
    const response = await fetch("/tryon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ top: topPath, bottom: bottomPath }),
      credentials: "include"
    });

    const result = await response.json();

    if (result.error) {
      alert("오류: " + result.error);
      goSelect(); // ✅ session 유지
      return;
    }

    if (result.result) {
      goResult(result.result); // ✅ session_id 포함해서 result로 이동
    } else {
      alert("결과를 생성할 수 없습니다.");
      goSelect(); // ✅ session 유지
    }
  } catch (error) {
    console.error("Error:", error);
    alert("오류가 발생했습니다: " + error.message);
    goSelect(); // ✅ session 유지
  }
})();

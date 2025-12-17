(async function() {
  try {
    // ✅ (수정) sessionStorage에서 선택된 옷 정보 가져오기
    const top = sessionStorage.getItem("tryon_top") || "";
    const bottom = sessionStorage.getItem("tryon_bottom") || "";

    if (!top && !bottom) {
      alert("옷 선택 정보가 없습니다.");
      window.location.href = "/select";
      return;
    }

    // ✅ (수정) tryonData 형태로 맞춰서 사용 (기존 흐름 유지)
    const tryonData = {
      top: top || null,
      bottom: bottom || null
    };

    // 사용자 이미지 업로드 (기존 그대로)
    const capturedImage = localStorage.getItem("capturedImage");
    if (capturedImage) {
      await fetch("/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: capturedImage })
      });
    }

    // ✅ (수정) 서버로 보낼 때 경로 변환하지 말고 "/static/..." 그대로 보낸다
    const topPath = tryonData.top || null;
    const bottomPath = tryonData.bottom || null;

    // Try-on API 호출 (기존 그대로, mode 제거)
    const response = await fetch("/tryon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ top: topPath, bottom: bottomPath })
    });

    const result = await response.json();

    if (result.error) {
      alert("오류: " + result.error);
      window.location.href = "/select";
      return;
    }

    if (result.result) {
      window.location.href = `/result?image=${encodeURIComponent(result.result)}`;
    } else {
      alert("결과를 생성할 수 없습니다.");
      window.location.href = "/select";
    }

  } catch (error) {
    console.error("Error:", error);
    alert("오류가 발생했습니다: " + error.message);
    window.location.href = "/select";
  }
})();

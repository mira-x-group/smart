const screenMain  = document.getElementById("screenMain");
const namedropOrb = document.getElementById("namedropOrb");
const waveLayer   = document.getElementById("waveLayer");
const looksPanel  = document.getElementById("looksPanel");

let nfcOpened = false;

// ✅ nfc.html에서 주입한 값: window.MIRROR_CTX = { mirror_id, session_id }
function getCtx() {
  const ctx = window.MIRROR_CTX || {};
  return {
    mirror_id: (ctx.mirror_id || "").trim(),
    session_id: (ctx.session_id || "").trim(),
  };
}

function goCapture() {
  const { mirror_id, session_id } = getCtx();

  // ✅ 세션 없으면 흐름이 성립 안 함 → welcome으로 복귀
  if (!session_id) {
    window.location.href = "/mirror";
    return;
  }

  const mid = encodeURIComponent(mirror_id || "");
  const sid = encodeURIComponent(session_id);

  // ✅ 세션 유지해서 capture로 이동
  window.location.href = `/capture?mirror_id=${mid}&session_id=${sid}`;
}

function openNFC() {
  if (nfcOpened) return;
  nfcOpened = true;

  // 애니메이션 트리거
  namedropOrb.classList.remove("active");
  void namedropOrb.offsetWidth;
  namedropOrb.classList.add("active");

  waveLayer.classList.remove("active");
  looksPanel.classList.remove("active");
  void waveLayer.offsetWidth;

  setTimeout(() => {
    waveLayer.classList.add("active");
  }, 120);

  setTimeout(() => {
    looksPanel.classList.add("active");
  }, 260);

  // ✅ NFC 애니메이션 후 자동으로 capture 페이지로 이동
  setTimeout(() => {
    goCapture();
  }, 1500); // 필요하면 1000~2000 조절
}

function closeNFC() {
  nfcOpened = false;
  namedropOrb.classList.remove("active");
  waveLayer.classList.remove("active");
  looksPanel.classList.remove("active");
}

/**
 * ✅ 핵심 변경점:
 * - 클릭 이벤트 제거
 * - 페이지 들어오면 자동으로 openNFC() 실행
 */
window.addEventListener("DOMContentLoaded", () => {
  // 혹시라도 DOM이 늦게 잡히는 경우 대비
  // (지금은 위에서 getElementById로 이미 잡히지만 안정성)
  setTimeout(() => openNFC(), 0);
});

// ❌ 기존 클릭 토글은 제거 (원하면 디버그용으로만 남겨도 됨)
// screenMain.addEventListener("click", () => {
//   if (!nfcOpened) openNFC();
//   else closeNFC();
// });

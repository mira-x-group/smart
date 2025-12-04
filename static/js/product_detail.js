// static/js/product_detail.js

// 1) 세션 ID 가져오거나 새로 생성
function getOrCreateSessionId() {
  const KEY = "smartmirror_session_id";

  let sessionId = localStorage.getItem(KEY);
  if (!sessionId) {
    // 브라우저에서 crypto.randomUUID 지원하면 그거 사용
    if (window.crypto && window.crypto.randomUUID) {
      sessionId = window.crypto.randomUUID();
    } else {
      // 구형 브라우저 대비 간단한 UUID 대체 구현
      sessionId = "session-" + Math.random().toString(36).substring(2) + Date.now();
    }

    localStorage.setItem(KEY, sessionId);
    console.log("새 세션 생성:", sessionId);
  } else {
    console.log("기존 세션 사용:", sessionId);
  }

  return sessionId;
}

// 2) 서버에 세션 등록
async function initSessionOnServer(sessionId) {
  try {
    const res = await fetch("/api/session/init", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    });

    if (!res.ok) {
      console.error("세션 초기화 실패:", res.status);
    } else {
      console.log("세션 초기화 완료");
    }
  } catch (err) {
    console.error("세션 초기화 에러:", err);
  }
}

// 3) 현재 상품 클릭 로그 서버에 전송
async function logProductForSession(sessionId, productId) {
  try {
    const res = await fetch(`/api/session/${sessionId}/product`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ productId }),
    });

    if (!res.ok) {
      console.error("상품 로그 전송 실패:", res.status);
    } else {
      console.log("상품 로그 전송 완료:", productId);
    }
  } catch (err) {
    console.error("상품 로그 전송 에러:", err);
  }
}

// 4) 페이지 로드 시 자동 실행
document.addEventListener("DOMContentLoaded", async () => {
  const productId = window.CURRENT_PRODUCT_ID;

  if (!productId) {
    console.error("CURRENT_PRODUCT_ID가 설정되지 않았습니다.");
    return;
  }

  // 1) 세션 ID 준비
  const sessionId = getOrCreateSessionId();

  // 2) 서버에 세션 등록 (이미 있으면 백엔드에서 알아서 처리하도록)
  await initSessionOnServer(sessionId);

  // 3) 현재 페이지의 상품을 세션에 기록
  await logProductForSession(sessionId, productId);
});

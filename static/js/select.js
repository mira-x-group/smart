const clothesStrip = document.getElementById("clothesStrip");

const previewOverlay = document.getElementById("previewOverlay");
const previewImageArea = document.getElementById("previewImageArea");
const previewLookName = document.getElementById("previewLookName");
const previewCancelBtn = document.getElementById("previewCancelBtn");
const previewSelectBtn = document.getElementById("previewSelectBtn");

const mirrorContainer = document.querySelector(".mirror-container");
const tryOnButton = document.getElementById("tryOnButton");

let currentPreviewItem = null;

/* =====================================================
   ✅ 서버 데이터로 슬롯 이미지 주입 (UI/UX 그대로)
   - select.html에서 window.SESSION_TOPS / window.SESSION_BOTTOMS 로 주입된 데이터 사용
   - 1~3: tops, 4~6: bottoms
   - 데이터 없으면 해당 슬롯 숨김

   ✅ (수정) 서버 주입 데이터가 아래 형태 모두 대응:
   1) ["/static/tops/top1.png", ...] (문자열 배열)
   2) [{id: 1, image_url: "..."} , ...] (객체 배열)
   3) [{id: 1, image_path: "tops/top1.png"} , ...]
===================================================== */
(function injectSlotImagesFromServer() {
  if (!clothesStrip) return;

  const items = clothesStrip.querySelectorAll(".cloth-item");

  function toItemObj(v) {
    if (!v) return { src: "", id: "" };
    if (typeof v === "string") return { src: v, id: "" };

    const id = (v.id !== undefined && v.id !== null) ? String(v.id) : "";
    let src = "";

    if (v.image_url) src = v.image_url;
    else if (v.imagePath) src = v.imagePath;
    else if (v.image_path) src = v.image_path;
    else if (v.src) src = v.src;

    if (src && !src.startsWith("/") && !src.startsWith("http")) {
      src = "/static/" + src;
    }
    return { src, id };
  }

  const topsRaw = window.SESSION_TOPS || [];
  const bottomsRaw = window.SESSION_BOTTOMS || [];

  const tops = topsRaw.map(v => ({ ...toItemObj(v), category: "top" }));
  const bottoms = bottomsRaw.map(v => ({ ...toItemObj(v), category: "bottom" }));

  const allItems = [...tops, ...bottoms].slice(0, 6);

  const slotData = [
    allItems[0] || { src: "", id: "", category: "" },
    allItems[1] || { src: "", id: "", category: "" },
    allItems[2] || { src: "", id: "", category: "" },
    allItems[3] || { src: "", id: "", category: "" },
    allItems[4] || { src: "", id: "", category: "" },
    allItems[5] || { src: "", id: "", category: "" },
  ];

  items.forEach((item, idx) => {
    const wrap = item.querySelector(".cloth-image-wrapper");
    if (!wrap) return;

    const { src, id, category } = slotData[idx] || { src: "", id: "", category: "" };

    if (!src) {
      item.style.display = "none";
      return;
    }
    item.style.display = "";

    let img = wrap.querySelector("img");
    if (!img) {
      img = document.createElement("img");
      wrap.appendChild(img);
    }

    img.src = src;
    img.alt = item.dataset.name || `LOOK ${idx + 1}`;
    img.loading = "eager";
    img.decoding = "async";

    // ✅ select.html이 이미 data-product-id를 박아주지만,
    // 서버 주입 데이터에 id가 있으면 혹시 비어있을 때만 보강
    if (!item.dataset.productId && id) {
      item.dataset.productId = id;
    }

    if (category) {
      item.dataset.category = category;
    }
  });
})();

/* =====================================================
   ✅ 하트 상태만 토글 (킵시트 기능 삭제)
===================================================== */
function setHeartState(heartBtn, active) {
  if (active) {
    heartBtn.classList.add("active");
    heartBtn.textContent = "♥";
  } else {
    heartBtn.classList.remove("active");
    heartBtn.textContent = "♡";
  }
}

function openPreview(forItem) {
  currentPreviewItem = forItem;
  const source = forItem.dataset.name || "LOOK";
  previewLookName.textContent = source;

  const imgWrapper = forItem.querySelector(".cloth-image-wrapper");
  previewImageArea.innerHTML = "";
  if (imgWrapper) {
    const clone = imgWrapper.cloneNode(true);
    previewImageArea.appendChild(clone);
  }

  previewOverlay.classList.add("visible");
}

function closePreview() {
  previewOverlay.classList.remove("visible");
  currentPreviewItem = null;
}

previewCancelBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  closePreview();
});

previewOverlay.addEventListener("click", (e) => {
  const card = document.getElementById("previewCard");
  if (!card.contains(e.target)) {
    closePreview();
  }
});

previewSelectBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!currentPreviewItem) return;
  const already = currentPreviewItem.classList.contains("selected");
  currentPreviewItem.classList.toggle("selected", !already);
  closePreview();
});

clothesStrip.querySelectorAll(".cloth-item").forEach(item => {
  const favBtn = item.querySelector(".cloth-fav");
  if (favBtn) {
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      const source = (item.dataset.name || "").trim();
      if (!source) return;

      // keep_sheet.js 로드 안 됐으면(또는 가드로 종료됐으면) 하트만 토글
      if (!window.keepSheet) {
        const isActive = favBtn.classList.contains("active");
        setHeartState(favBtn, !isActive);
        return;
      }

      if (favBtn.classList.contains("active")) {
        // ♥ -> ♡ : 킵시트에서 제거
        setHeartState(favBtn, false);
        window.keepSheet.removeFromPanelBySource(source);
      } else {
        // ♡ -> ♥ : 킵시트에 추가
        setHeartState(favBtn, true);
        window.keepSheet.addToPanel(item); // item의 img/src/name을 keep_sheet가 읽어서 카드 생성
      }
    });
  }

  item.addEventListener("click", (e) => {
    if (e.target.closest(".cloth-fav")) return;
    if (item.classList.contains("selected")) {
      item.classList.remove("selected");
      return;
    }
    openPreview(item);
  });
});


// 착용하기 버튼: 선택된 룩(없으면 LOOK 1)을 로딩 화면으로 이동
if (tryOnButton) {
  tryOnButton.addEventListener("click", (e) => {
    e.stopPropagation();

    let targetItem =
      clothesStrip.querySelector(".cloth-item.selected") ||
      clothesStrip.querySelector('.cloth-item[data-name="LOOK 1"]');

    if (targetItem) {
      const imgEl = targetItem.querySelector(".cloth-image-wrapper img");
      const src = imgEl ? (imgEl.getAttribute("src") || "") : "";

      sessionStorage.setItem("tryon_top", "");
      sessionStorage.setItem("tryon_bottom", "");

      const category = targetItem.dataset.category || "";

      if (src) {
        if (category === "top") {
          sessionStorage.setItem("tryon_top", src);
        } else if (category === "bottom") {
          sessionStorage.setItem("tryon_bottom", src);
        } else {
          sessionStorage.setItem("tryon_top", src);
        }
      }
    }

   const qs = [];
if (window.SESSION_ID) qs.push("session_id=" + encodeURIComponent(window.SESSION_ID));
if (window.MIRROR_ID)  qs.push("mirror_id=" + encodeURIComponent(window.MIRROR_ID));
window.location.href = "/loading" + (qs.length ? "?" + qs.join("&") : "");

  });
}

// 모든 버튼 공통 프레스 효과
document.querySelectorAll("button").forEach(btn => {
  btn.addEventListener("mousedown", () => {
    btn.classList.add("pressed");
  });
  btn.addEventListener("mouseup", () => {
    btn.classList.remove("pressed");
  });
  btn.addEventListener("mouseleave", () => {
    btn.classList.remove("pressed");
  });
  btn.addEventListener("touchstart", () => {
    btn.classList.add("pressed");
  }, { passive: true });
  btn.addEventListener("touchend", () => {
    btn.classList.remove("pressed");
  });
});

// =====================================================
// 🎙️ STT – Select Page (킵시트 관련 커맨드 삭제 버전)
// =====================================================
(function () {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    console.warn("Web Speech API 미지원(Chrome 필요)");
    return;
  }

  var stt = new SR();
  stt.lang = "ko-KR";
  stt.continuous = false;
  stt.interimResults = false;

  var busy = false;
  var timer = null;
  var primed = false;

  function normalize(text) {
    return (text || "")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[.,!?~。、“”"'’‘]/g, "");
  }

  function isPreviewOpen() {
    return previewOverlay && previewOverlay.classList.contains("visible");
  }

  function getItems() {
    return Array.prototype.slice.call(clothesStrip.querySelectorAll(".cloth-item"));
  }

  function parseNumber(t) {
    var m = t.match(/(\d+)/);
    if (m && m[1]) {
      var n = parseInt(m[1], 10);
      if (!isNaN(n)) return n;
    }

    var map = {
      "일": 1, "한": 1, "첫": 1,
      "이": 2, "두": 2,
      "삼": 3, "세": 3,
      "사": 4, "네": 4,
      "오": 5, "다섯": 5,
      "육": 6, "여섯": 6,
      "칠": 7, "일곱": 7,
      "팔": 8, "여덟": 8,
      "구": 9, "아홉": 9
    };

    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (t.indexOf(k + "번") >= 0) return map[k];
    }
    for (var j = 0; j < keys.length; j++) {
      var kk = keys[j];
      if (t.indexOf(kk) >= 0) return map[kk];
    }

    return null;
  }

  function doSelectLook(n) {
    var items = getItems();
    if (!items.length) return;
    if (n < 1 || n > items.length) return;
    items[n - 1].click();
  }

  function doPreviewCancel() {
    if (!isPreviewOpen()) return;
    previewCancelBtn.click();
  }

  function doPreviewSelect() {
    if (!isPreviewOpen()) return;
    previewSelectBtn.click();
  }

  function doKeepLook(n) {
    var items = getItems();
    if (!items.length) return;
    if (n < 1 || n > items.length) return;
    var fav = items[n - 1].querySelector(".cloth-fav");
    if (fav) fav.click(); // ✅ 하트 토글만 유지
  }

  function doTryOn() {
    if (!tryOnButton) return;

    if (isPreviewOpen()) {
      previewSelectBtn.click();
      setTimeout(function () {
        tryOnButton.click();
      }, 220);
    } else {
      tryOnButton.click();
    }
  }

  function handleVoice(raw) {
    var t = normalize(raw);
    console.log("🎙️ SELECT:", raw, "->", t);

    if (isPreviewOpen() && /(취소|아니야|닫아|그만)/.test(t)) {
      doPreviewCancel();
      return;
    }
    if (isPreviewOpen() && /(선택|결정|이걸로|확정|오케이|ok)/.test(t)) {
      doPreviewSelect();
      return;
    }

    if (/(착용|입혀|입어|피팅|시작)/.test(t)) {
      doTryOn();
      return;
    }

    var n = parseNumber(t);

    if (n !== null && /(킵|찜|담아|저장|하트)/.test(t)) {
      doKeepLook(n);
      return;
    }

    if (n !== null && /(선택|골라|보여|프리뷰|확인)/.test(t)) {
      doSelectLook(n);
      return;
    }
  }

  stt.onstart = function () { busy = true; };
  stt.onend = function () { busy = false; restart(); };

  stt.onresult = function (e) {
    var text = "";
    if (e && e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) {
      text = ("" + e.results[0][0].transcript).trim();
    }
    if (text) handleVoice(text);
  };

  stt.onerror = (e) => {
  if (e.error === "aborted") return; // ✅ 정상 중단/경쟁 상황은 무시
  console.warn("STT error(select):", e);
};


  function start() {
    if (busy) return;
    try { stt.start(); } catch (e) {}
  }

  function restart() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      start();
    }, 600);
  }

  window.addEventListener("load", function () {
    setTimeout(function () {
      start();
    }, 800);
  });

  function primeOnce() {
    if (primed) return;
    primed = true;
    start();
  }
  document.addEventListener("click", primeOnce);
  document.addEventListener("touchstart", primeOnce, { passive: true });
})();

window.__keepSheetOnRemove = function(source) {
  const gridItem = [...clothesStrip.querySelectorAll(".cloth-item")]
    .find(ci => (ci.dataset.name || "").trim() === source);
  if (!gridItem) return;

  const heart = gridItem.querySelector(".cloth-fav");
  if (heart) setHeartState(heart, false);
};

/* =====================================================
   ✅ KEEP 버튼 클릭 -> staff 신호(/api/keep) -> /mirror 이동
   - 기존 기능(STT/킵시트/프리뷰/착용하기) 절대 건드리지 않음
   - ✅ product_id만 select.html의 data-product-id에서 뽑아서 전송
===================================================== */

// ✅ select.html 구조에 맞게 product_id 뽑기 (UI/UX 무변경)
function getProductIdForKeep() {
  if (!clothesStrip) return null;

  // 1) 선택된 룩 우선
  const selected = clothesStrip.querySelector(".cloth-item.selected");
  const pid1 = selected && selected.dataset ? (selected.dataset.productId || "") : "";
  if (pid1 && String(pid1).trim() !== "") return pid1;

  // 2) 하트(active) 된 룩 우선
  const activeFav = clothesStrip.querySelector(".cloth-fav.active");
  const activeItem = activeFav ? activeFav.closest(".cloth-item") : null;
  const pid2 = activeItem && activeItem.dataset ? (activeItem.dataset.productId || "") : "";
  if (pid2 && String(pid2).trim() !== "") return pid2;

  // 3) LOOK 1 fallback
  const look1 = clothesStrip.querySelector('.cloth-item[data-name="LOOK 1"]');
  const pid3 = look1 && look1.dataset ? (look1.dataset.productId || "") : "";
  if (pid3 && String(pid3).trim() !== "") return pid3;

  return null;
}

(function bindKeepButtonRedirect() {
  const keepBtn = document.getElementById("keepButton");
  if (!keepBtn) {
    console.warn("[select.js] keepButton not found");
    return;
  }

  keepBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const payload = {
        from: "select",
        mirror_id: window.MIRROR_ID || null,
        session_id: window.SESSION_ID || null,
        // ✅ 핵심: product_id를 null이 아니라 실제 값으로
        product_id: getProductIdForKeep()
      };

      const res = await fetch("/api/keep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        console.warn("[select.js] /api/keep failed:", res.status);
      }
    } catch (err) {
      console.warn("[select.js] /api/keep error:", err);
    }

    // ✅ 무조건 mirror(welcome)로 이동
    window.location.href = "/mirror";
  });
})();

/* =====================================================
   ✅ selectAPI: STT에서 사용할 API 객체
===================================================== */
(function() {
  function getItemByNumber(n) {
    const items = Array.from(clothesStrip.querySelectorAll(".cloth-item"));
    if (n < 1 || n > items.length) return null;
    return items[n - 1];
  }

  function getFavButton(item) {
    return item ? item.querySelector(".cloth-fav") : null;
  }

  window.selectAPI = {
    // 착용하기
    tryOn: function() {
      if (tryOnButton) {
        tryOnButton.click();
      }
    },

    // KEEP 팝업 열기 (KEEP 버튼 클릭)
    openKeepPopup: function() {
      const keepBtn = document.getElementById("keepButton") || document.querySelector(".btn-keep");
      if (keepBtn) {
        keepBtn.click();
      }
    },

    // 킵시트 열기
    openKeepSheet: function() {
      if (window.keepSheet && window.keepSheet.openPanel) {
        window.keepSheet.openPanel();
      } else {
        const edgeHandle = document.getElementById("edgeHandle");
        if (edgeHandle && !edgeHandle.classList.contains("open")) {
          edgeHandle.click();
        }
      }
    },

    // 킵시트 닫기
    closeKeepSheet: function() {
      if (window.keepSheet && window.keepSheet.closePanel) {
        window.keepSheet.closePanel();
      } else {
        const panelCloseButton = document.getElementById("panelCloseButton");
        if (panelCloseButton) {
          panelCloseButton.click();
        }
      }
    },

    // num번 아이템 킵 토글
    toggleKeep: function(num) {
      const item = getItemByNumber(num);
      if (!item) return;
      const favBtn = getFavButton(item);
      if (favBtn) {
        favBtn.click();
      }
    },

    // num번 아이템 선택 토글 (프리뷰 열기/닫기)
    toggleSelect: function(num) {
      const item = getItemByNumber(num);
      if (!item) return;

      if (item.classList.contains("selected")) {
        item.classList.remove("selected");
        if (previewOverlay && previewOverlay.classList.contains("visible")) {
          closePreview();
        }
      } else {
        openPreview(item);
      }
    }
  };
})();

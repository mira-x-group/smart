const edgePanel = document.getElementById("edgePanel");
const edgeHandle = document.getElementById("edgeHandle");
const clothesStrip = document.getElementById("clothesStrip");
const panelList = document.getElementById("panelList");
const panelCount = document.getElementById("panelCount");
const panelCloseButton = document.getElementById("panelCloseButton");

// ✅ 추가: 핸들 배지 DOM (HTML에 <span id="keepBadge"> 있어야 함)
const keepBadge = document.getElementById("keepBadge");

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
    // v가 문자열이면 src만 있는 객체로 변환
    if (!v) return { src: "", id: "" };
    if (typeof v === "string") return { src: v, id: "" };

    // 객체면 가능한 키들 흡수
    const id = (v.id !== undefined && v.id !== null) ? String(v.id) : "";
    let src = "";

    if (v.image_url) src = v.image_url;
    else if (v.imagePath) src = v.imagePath;
    else if (v.image_path) src = v.image_path;
    else if (v.src) src = v.src;

    // image_path가 "tops/top1.png" 형태면 /static 붙이기
    if (src && !src.startsWith("/") && !src.startsWith("http")) {
      src = "/static/" + src;
    }
    return { src, id };
  }

  // ✅ 수정: 최대 6개까지 표시하도록 변경
  // - 상의가 많으면 상의가 더 많은 슬롯을 차지할 수 있음
  // - 하의가 많으면 하의가 더 많은 슬롯을 차지할 수 있음
  // - 총 6개 슬롯을 순차적으로 채움
  const topsRaw = window.SESSION_TOPS || [];
  const bottomsRaw = window.SESSION_BOTTOMS || [];
  
  const tops = topsRaw.map(v => ({ ...toItemObj(v), category: "top" }));
  const bottoms = bottomsRaw.map(v => ({ ...toItemObj(v), category: "bottom" }));
  
  // 모든 아이템을 하나의 배열로 합치기 (상의 먼저, 그 다음 하의)
  const allItems = [...tops, ...bottoms].slice(0, 6);
  
  // 6개 슬롯에 순차적으로 채우기
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

    // ✅ (추가) product_id를 슬롯에 저장 (있을 때만)
    // - select.html에서 data-product-id를 이미 넣어놨다면 건드리지 않음
    // - 서버가 객체로 주입(id 포함)하면 여기서 자동 세팅됨
    if (!item.dataset.productId && id) {
      item.dataset.productId = id;
    }
    
    // ✅ (추가) category를 슬롯에 저장 (착용하기 버튼에서 사용)
    if (category) {
      item.dataset.category = category;
    }
  });
})();

/* =====================================================
   ✅ 추가: 핸들 bump + 배지 업데이트 유틸
===================================================== */
function bumpKeepHandle() {
  if (!edgeHandle) return;
  edgeHandle.classList.remove("bump");
  void edgeHandle.offsetWidth;
  edgeHandle.classList.add("bump");
}

function updateKeepBadge(count, animate = false) {
  if (!keepBadge) return;

  keepBadge.textContent = String(count);

  if (count > 0) {
    keepBadge.classList.add("visible");

    if (animate) {
      keepBadge.classList.remove("pop");
      void keepBadge.offsetWidth;
      keepBadge.classList.add("pop");
    }
  } else {
    keepBadge.classList.remove("visible");
    keepBadge.classList.remove("pop");
  }
}

edgeHandle.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = edgePanel.classList.toggle("open");
  edgeHandle.classList.toggle("open", isOpen);
});

panelCloseButton.addEventListener("click", (e) => {
  e.stopPropagation();
  edgePanel.classList.remove("open");
  edgeHandle.classList.remove("open");
});

function updateCount({ animateBadge = false } = {}) {
  const count = panelList.querySelectorAll(".panel-item").length;
  panelCount.textContent = count + "개";
  updateKeepBadge(count, animateBadge);
}

function findPanelItemBySource(source) {
  const items = panelList.querySelectorAll(".panel-item");
  for (const item of items) {
    if (item.dataset.source === source) return item;
  }
  return null;
}

function addToPanel(fromItem) {
  const source = fromItem.dataset.name || "";
  if (!source) return;

  if (findPanelItemBySource(source)) return;

  const panelItem = document.createElement("div");
  panelItem.className = "panel-item";
  panelItem.dataset.source = source;

  // ✅ (추가) productId도 패널에 저장 (있을 때만)
  const productId = fromItem.dataset.productId || "";
  if (productId) panelItem.dataset.productId = productId;

  const imageWrapper = document.createElement("div");
  imageWrapper.className = "panel-item-image-wrapper";

  const originalImg = fromItem.querySelector("img");
  if (originalImg && originalImg.getAttribute("src")) {
    const img = document.createElement("img");
    img.src = originalImg.getAttribute("src");
    img.alt = originalImg.getAttribute("alt") || source || "선택한 옷";
    imageWrapper.appendChild(img);
  } else {
    const placeholder = document.createElement("div");
    placeholder.textContent = source.replace("LOOK ", "") || "NO";
    placeholder.style.fontSize = "11px";
    placeholder.style.color = "#9ca3af";
    imageWrapper.appendChild(placeholder);
  }

  const textBox = document.createElement("div");
  textBox.className = "panel-item-text";

  const name = document.createElement("div");
  name.className = "panel-item-name";
  name.textContent = source || "LOOK";

  const meta = document.createElement("div");
  meta.className = "panel-item-meta";
  meta.textContent = "선택됨 · 피팅 후보";

  textBox.appendChild(name);
  textBox.appendChild(meta);

  const removeBtn = document.createElement("button");
  removeBtn.className = "panel-item-remove";
  removeBtn.textContent = "×";

  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    panelItem.remove();

    updateCount({ animateBadge: false });

    const gridItem = [...clothesStrip.querySelectorAll(".cloth-item")].find(
      ci => (ci.dataset.name || "") === source
    );
    if (gridItem) {
      const heart = gridItem.querySelector(".cloth-fav");
      if (heart) {
        setHeartState(heart, false);
      }
    }
  });

  panelItem.appendChild(imageWrapper);
  panelItem.appendChild(textBox);
  panelItem.appendChild(removeBtn);

  panelList.appendChild(panelItem);

  updateCount({ animateBadge: true });
  bumpKeepHandle();
}

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
      const source = item.dataset.name || "";

      if (favBtn.classList.contains("active")) {
        setHeartState(favBtn, false);
        const panelItem = findPanelItemBySource(source);
        if (panelItem) {
          panelItem.remove();
          updateCount({ animateBadge: false });
        } else {
          updateCount({ animateBadge: false });
        }
      } else {
        addToPanel(item);
        setHeartState(favBtn, true);
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

// 착용하기 버튼: 선택된 룩(없으면 LOOK 1)을 킵에 추가 후 로딩 화면으로 이동
if (tryOnButton) {
  tryOnButton.addEventListener("click", (e) => {
    e.stopPropagation();

    let targetItem =
      clothesStrip.querySelector(".cloth-item.selected") ||
      clothesStrip.querySelector('.cloth-item[data-name="LOOK 1"]');

    if (targetItem) {
      addToPanel(targetItem);

      const imgEl = targetItem.querySelector(".cloth-image-wrapper img");
      const src = imgEl ? (imgEl.getAttribute("src") || "") : "";

      sessionStorage.setItem("tryon_top", "");
      sessionStorage.setItem("tryon_bottom", "");

      // ✅ 수정: 슬롯 번호 대신 category 속성 사용
      const category = targetItem.dataset.category || "";
      
      if (src) {
        if (category === "top") {
          sessionStorage.setItem("tryon_top", src);
        } else if (category === "bottom") {
          sessionStorage.setItem("tryon_bottom", src);
        } else {
          // category가 없으면 기본값으로 top 설정
          sessionStorage.setItem("tryon_top", src);
        }
      }
    }

    window.location.href = "/loading";
  });
}

// 킵 패널 외 영역 클릭 시 킵 패널 접기 (오버레이 열려있으면 무시)
mirrorContainer.addEventListener("click", (e) => {
  if (previewOverlay.classList.contains("visible")) {
    return;
  }

  if (!edgePanel.classList.contains("open")) return;

  const clickInsidePanel = edgePanel.contains(e.target);
  const clickOnHandle = edgeHandle.contains(e.target);

  if (!clickInsidePanel && !clickOnHandle) {
    edgePanel.classList.remove("open");
    edgeHandle.classList.remove("open");
  }
});

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

/* ✅ 추가: 첫 로드 시 배지/카운트 초기 동기화 */
updateCount({ animateBadge: false });

/* =====================================================
   ✅ KEEP 버튼 -> (서버로 keep 신호 전송) -> 팝업 -> 2초 후 닫기 -> welcome 이동
   - UI/UX는 그대로
   - 추가된 건 "신호 전송" 뿐
===================================================== */
const keepActionButton = document.getElementById("keepActionButton");
const keepModalOverlay = document.getElementById("keepModalOverlay");
const keepModalTitle = document.getElementById("keepModalTitle");

let keepBusy = false;

function openKeepModal(roomNumber = 7) {
  if (!keepModalOverlay) return;

  if (keepModalTitle) {
    keepModalTitle.textContent = `${roomNumber}번 피팅룸으로 이동해주세요`;
  }

  keepModalOverlay.classList.remove("closing");
  keepModalOverlay.classList.add("visible");
  keepModalOverlay.setAttribute("aria-hidden", "false");
}

function closeKeepModal() {
  if (!keepModalOverlay) return;

  keepModalOverlay.classList.add("closing");

  setTimeout(() => {
    keepModalOverlay.classList.remove("visible");
    keepModalOverlay.classList.remove("closing");
    keepModalOverlay.setAttribute("aria-hidden", "true");
  }, 280);
}

function goWelcome() {
  window.location.href = "/";
}

// ✅ (수정) 서버에 KEEP 이벤트 생성
async function postKeepToServer(productId) {
  const body = {};

  // ✅ FIX: 쿠키 의존 제거(아이폰/https/http 섞여도 안전)
  if (window.SESSION_ID) {
    body.session_id = window.SESSION_ID;
  }

  // productId가 있을 때만 보내면 서버에서 Product 매칭 가능
  if (productId !== undefined && productId !== null && String(productId).trim() !== "") {
    body.product_id = productId;
  }

  const res = await fetch("/api/keep", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`KEEP failed (${res.status}): ${t}`);
  }
  return res.json();
}

// ✅ (추가) 현재 킵시트에 담긴 상품 id 모으기
function collectPanelProductIds() {
  const panelItems = [...panelList.querySelectorAll(".panel-item")];
  return panelItems.map(el => el.dataset.productId).filter(Boolean);
}

// ✅ (추가) 선택된/기본 룩에서 product_id 얻기
function getFallbackSelectedProductId() {
  const selected =
    clothesStrip.querySelector(".cloth-item.selected") ||
    clothesStrip.querySelector('.cloth-item[data-name="LOOK 1"]');

  return selected ? (selected.dataset.productId || "") : "";
}

if (keepActionButton) {
  keepActionButton.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (keepBusy) return;
    keepBusy = true;

    try {
      // ✅ 1) 서버로 KEEP 신호 전송 (킵시트에 담긴 것 기준)
      let productIds = collectPanelProductIds();

      // 킵시트가 비어있으면 선택된 룩(없으면 LOOK 1) 하나라도 전송
      if (productIds.length === 0) {
        const fallbackId = getFallbackSelectedProductId();
        if (fallbackId) productIds = [fallbackId];
      }

      // ✅ FIX: product_id 없으면 keep 이벤트 생성 금지 (빈 카드 방지)
      if (productIds.length === 0) {
        alert("상품을 먼저 하트로 담아주세요. (product_id 없음)");
        keepBusy = false;
        return;
      }

      // 여러 개 담겼으면 여러 개 KEEP 이벤트 생성
      await Promise.all(productIds.map(pid => postKeepToServer(pid)));

      // ✅ 2) 기존 UX 그대로
      openKeepModal(7);

      setTimeout(() => {
        closeKeepModal();

        setTimeout(() => {
          goWelcome();
        }, 320);
      }, 2000);

    } catch (err) {
      console.error(err);
      alert("KEEP 전송 실패! (콘솔/Network 확인)");
      keepBusy = false;
      return;
    }
  });
}

// =====================================================
// 🎙️ STT – Select Page (확정 스펙 6개)
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
    if (fav) fav.click();
  }

  function doOpenKeepSheet() {
    if (!edgePanel.classList.contains("open")) {
      edgeHandle.click();
    }
  }

  function doCloseKeepSheet() {
    panelCloseButton.click();
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

    if (/(킵시트|찜시트|킵목록|찜목록|목록).*(열|보여|켜|오픈)/.test(t)) {
      doOpenKeepSheet();
      return;
    }

    if (/(킵시트|찜시트|킵목록|찜목록|목록).*(닫|꺼|접|클로즈)/.test(t)) {
      doCloseKeepSheet();
      return;
    }

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

  stt.onerror = function (e) {
    console.warn("STT error(select):", e);
    busy = false;
    restart();
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

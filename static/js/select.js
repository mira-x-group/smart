const edgePanel = document.getElementById("edgePanel");
const edgeHandle = document.getElementById("edgeHandle");
const clothesStrip = document.getElementById("clothesStrip");
const panelList = document.getElementById("panelList");
const panelCount = document.getElementById("panelCount");
const panelCloseButton = document.getElementById("panelCloseButton");

const previewOverlay = document.getElementById("previewOverlay");
const previewImageArea = document.getElementById("previewImageArea");
const previewLookName = document.getElementById("previewLookName");
const previewCancelBtn = document.getElementById("previewCancelBtn");
const previewSelectBtn = document.getElementById("previewSelectBtn");

const pickupOverlay = document.getElementById("pickupOverlay");
const pickupCard = document.getElementById("pickupCard");
const pickupClose = document.getElementById("pickupClose");
const pickupButton = document.getElementById("pickupButton");
const roomStatusButton = document.getElementById("roomStatusButton");

const mirrorContainer = document.querySelector(".mirror-container");
const tryOnButton = document.getElementById("tryOnButton");

let currentPreviewItem = null;

/* =====================================================
   ✅ 슬롯 이미지 자동 주입 (1~3: tops, 4~6: bottoms)
   - HTML에 <img> 없어도 JS가 cloth-image-wrapper 안에 넣어줌
   - 이후 킵 패널/프리뷰에서 그대로 복제/표시됨
===================================================== */
(function injectSlotImages() {
  if (!clothesStrip) return;

  const items = clothesStrip.querySelectorAll(".cloth-item");
  const imgPaths = [
    "/static/tops/top1.png",
    "/static/tops/top2.png",
    "/static/tops/top3.png",
    "/static/bottoms/bottom1.png",
    "/static/bottoms/bottom2.png",
    "/static/bottoms/bottom3.png",
  ];

  items.forEach((item, idx) => {
    const wrap = item.querySelector(".cloth-image-wrapper");
    if (!wrap) return;
    if (!imgPaths[idx]) return;

    // 이미 img가 있으면 중복 생성 방지
    let img = wrap.querySelector("img");
    if (!img) {
      img = document.createElement("img");
      wrap.appendChild(img);
    }

    img.src = imgPaths[idx];
    img.alt = item.dataset.name || `LOOK ${idx + 1}`;
    img.loading = "eager"; // (선택) 미러 환경이면 바로 로딩 선호
    img.decoding = "async";
  });
})();

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

function updateCount() {
  const count = panelList.querySelectorAll(".panel-item").length;
  panelCount.textContent = count + "개";
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
    updateCount();
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
  updateCount();

  if (!edgePanel.classList.contains("open")) {
    edgePanel.classList.add("open");
    edgeHandle.classList.add("open");
  }
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
          updateCount();
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

      // ✅ [추가] 선택된 슬롯의 이미지 src를 뽑아서 sessionStorage에 저장
      const imgEl = targetItem.querySelector(".cloth-image-wrapper img");
      const src = imgEl ? (imgEl.getAttribute("src") || "") : "";

      // 기존 선택값 초기화
      sessionStorage.setItem("tryon_top", "");
      sessionStorage.setItem("tryon_bottom", "");

      // LOOK 1~3 => top, LOOK 4~6 => bottom
      const name = (targetItem.dataset.name || "").toUpperCase(); // "LOOK 1"
      const m = name.match(/LOOK\s*(\d+)/);
      const idx = m ? parseInt(m[1], 10) : NaN;

      if (src) {
        if (!isNaN(idx) && idx >= 1 && idx <= 3) {
          sessionStorage.setItem("tryon_top", src);
        } else if (!isNaN(idx) && idx >= 4 && idx <= 6) {
          sessionStorage.setItem("tryon_bottom", src);
        } else {
          // 혹시 이름이 이상하면: src를 top에라도 넣어둠(안전장치)
          sessionStorage.setItem("tryon_top", src);
        }
      }
    }

    // ✅ [수정] Flask 라우트로 이동 (파일 경로 X)
    window.location.href = "/loading";
  });
}

// 픽업/피팅룸 버튼 -> 오버레이 열기
function openPickupOverlay() {
  pickupOverlay.classList.add("visible");
}

function closePickupOverlay() {
  pickupOverlay.classList.remove("visible");
}

pickupButton.addEventListener("click", (e) => {
  e.stopPropagation();
  openPickupOverlay();
});

roomStatusButton.addEventListener("click", (e) => {
  e.stopPropagation();
  openPickupOverlay();
});

pickupClose.addEventListener("click", (e) => {
  e.stopPropagation();
  closePickupOverlay();
});

pickupOverlay.addEventListener("click", (e) => {
  if (!pickupCard.contains(e.target)) {
    closePickupOverlay();
  }
});

// 킵 패널 외 영역 클릭 시 킵 패널 접기 (오버레이 열려있으면 무시)
mirrorContainer.addEventListener("click", (e) => {
  if (previewOverlay.classList.contains("visible") || pickupOverlay.classList.contains("visible")) {
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


// =====================================================
// 🎙️ STT – Select Page (확정 스펙 6개)
// 1) n번 옷 선택해줘  -> 프리뷰만
// 2) (프리뷰) 취소 / 선택
// 3) n번 옷 킵해줘    -> 킵 시트에 담김(하트 버튼 클릭)
// 4) 킵 시트 열어줘
// 5) 킵 시트 닫아줘
// 6) 착용해줘         -> (프리뷰 열려있으면 선택 후) 착용하기 버튼 클릭
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
    // 1) 아라비아 숫자
    var m = t.match(/(\d+)/);
    if (m && m[1]) {
      var n = parseInt(m[1], 10);
      if (!isNaN(n)) return n;
    }

    // 2) 한글 숫자/서수 일부
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

  // 1) n번 선택 -> 프리뷰만 (item.click())
  function doSelectLook(n) {
    var items = getItems();
    if (!items.length) return;
    if (n < 1 || n > items.length) return;
    items[n - 1].click();
  }

  // 2) 프리뷰 취소/선택
  function doPreviewCancel() {
    if (!isPreviewOpen()) return;
    previewCancelBtn.click();
  }

  function doPreviewSelect() {
    if (!isPreviewOpen()) return;
    previewSelectBtn.click();
  }

  // 3) n번 킵 -> fav 버튼 클릭
  function doKeepLook(n) {
    var items = getItems();
    if (!items.length) return;
    if (n < 1 || n > items.length) return;
    var fav = items[n - 1].querySelector(".cloth-fav");
    if (fav) fav.click();
  }

  // 4) 킵 시트 열기
  function doOpenKeepSheet() {
    if (!edgePanel.classList.contains("open")) {
      edgeHandle.click();
    }
  }

  // 5) 킵 시트 닫기
  function doCloseKeepSheet() {
    panelCloseButton.click();
  }

  // 6) 착용하기
  function doTryOn() {
    if (!tryOnButton) return;

    if (isPreviewOpen()) {
      // 프리뷰 보고 있는 상태에서 "착용"하면: 선택(=selected 토글) 후 착용
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

    // 4) 킵 시트 열기
    if (/(킵시트|찜시트|킵목록|찜목록|목록).*(열|보여|켜|오픈)/.test(t)) {
      doOpenKeepSheet();
      return;
    }

    // 5) 킵 시트 닫기
    if (/(킵시트|찜시트|킵목록|찜목록|목록).*(닫|꺼|접|클로즈)/.test(t)) {
      doCloseKeepSheet();
      return;
    }

    // 2) 프리뷰 취소/선택 (프리뷰 열려있을 때만 처리)
    if (isPreviewOpen() && /(취소|아니야|닫아|그만)/.test(t)) {
      doPreviewCancel();
      return;
    }
    if (isPreviewOpen() && /(선택|결정|이걸로|확정|오케이|ok)/.test(t)) {
      doPreviewSelect();
      return;
    }

    // 6) 착용
    if (/(착용|입혀|입어|피팅|시작)/.test(t)) {
      doTryOn();
      return;
    }

    var n = parseNumber(t);

    // 3) n번 킵
    if (n !== null && /(킵|찜|담아|저장|하트)/.test(t)) {
      doKeepLook(n);
      return;
    }

    // 1) n번 선택(프리뷰만)
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

  // 자동 시작 시도
  window.addEventListener("load", function () {
    setTimeout(function () {
      start();
    }, 800);
  });

  // 자동 시작이 막히는 환경 대비(첫 클릭/터치로 프라임)
  function primeOnce() {
    if (primed) return;
    primed = true;
    start();
  }
  document.addEventListener("click", primeOnce);
  document.addEventListener("touchstart", primeOnce, { passive: true });
})();

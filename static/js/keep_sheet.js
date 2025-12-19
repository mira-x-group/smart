/* keep_sheet.js
   킵시트(패널) 공용 로직
   - open/close
   - panel item add/remove
   - count update + badge update
   - outside click close (overlays 열려있으면 무시)
   - pressed effect
   - sessionStorage sync (persistence)
   - ✅ KEEP 버튼 누르면 서버(/api/keep)로 신호 전송
*/

(function () {
  // ====== DOM ======
  const edgePanel = document.getElementById("edgePanel");
  const edgeHandle = document.getElementById("edgeHandle");

  // Badge DOM (Dynamic or Existing)
  let keepBadge = document.getElementById("keepBadge");
  if (!keepBadge && edgeHandle) {
    keepBadge = document.createElement("span");
    keepBadge.id = "keepBadge";
    keepBadge.className = "keep-badge";
    edgeHandle.appendChild(keepBadge);
  }

  const panelList = document.getElementById("panelList");
  const panelCount = document.getElementById("panelCount");
  const panelCloseButton = document.getElementById("panelCloseButton");

  // 선택적으로 존재할 수 있는 요소들 (페이지마다 다를 수 있음)
  const mirrorContainer = document.querySelector(".mirror-container");
  const previewOverlay = document.getElementById("previewOverlay");
  const pickupOverlay = document.getElementById("pickupOverlay");

  // Optional: keep button in panel footer
  const btnKeep = document.querySelector(".btn-keep");

  // 필수 DOM 없으면 아무것도 안 함
  if (!edgePanel || !edgeHandle || !panelList || !panelCount || !panelCloseButton) return;

  const STORAGE_KEY = "KEEP_SHEET_ITEMS";
  let keepBusy = false;

  // ====== helpers ======
  function updateCount() {
    const count = panelList.querySelectorAll(".panel-item").length;
    panelCount.textContent = count + "개";
    updateKeepBadge(count);
  }

  // ✅ 1) Handle Nudge Animation
  function animateHandleNudge() {
    if (!edgeHandle) return;

    edgeHandle.classList.remove("handle-nudge");
    void edgeHandle.offsetWidth;
    edgeHandle.classList.add("handle-nudge");

    setTimeout(() => {
      edgeHandle.classList.remove("handle-nudge");
    }, 450);
  }

  // ✅ 2) Badge Update (CSS가 visible 방식이든 display 방식이든 둘 다 대응)
  function updateKeepBadge(count) {
    if (!keepBadge) return;

    // 텍스트
    keepBadge.textContent = count > 99 ? "99+" : String(count);

    if (count <= 0) {
      // 숨김 (두 방식 모두 대응)
      keepBadge.classList.remove("visible");
      keepBadge.classList.remove("badge-pop");
      keepBadge.style.display = "none";
      return;
    }

    // 표시 (두 방식 모두 대응)
    keepBadge.style.display = "flex";
    keepBadge.classList.add("visible");

    // 팝 애니메이션
    keepBadge.classList.remove("badge-pop");
    void keepBadge.offsetWidth;
    keepBadge.classList.add("badge-pop");
  }

  function findPanelItemBySource(source) {
    const items = panelList.querySelectorAll(".panel-item");
    for (const item of items) {
      if (item.dataset.source === source) return item;
    }
    return null;
  }

  function openPanel() {
    if (!edgePanel.classList.contains("open")) {
      edgePanel.classList.add("open");
      edgeHandle.classList.add("open");
    }
  }

  function closePanel() {
    edgePanel.classList.remove("open");
    edgeHandle.classList.remove("open");
  }

  // ====== State Persistence (productId 포함) ======
  function saveState() {
    const items = [];
    panelList.querySelectorAll(".panel-item").forEach((item) => {
      const source = item.dataset.source || "";
      const productId = item.dataset.productId || "";
      const img = item.querySelector(".panel-item-image-wrapper img");
      const imgSrc = img ? img.getAttribute("src") : "";
      const name = item.querySelector(".panel-item-name")?.textContent || "";
      const meta = item.querySelector(".panel-item-meta")?.textContent || "";

      items.push({ source, productId, imgSrc, name, meta });
    });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function loadState() {
    try {
      const json = sessionStorage.getItem(STORAGE_KEY);
      if (!json) {
        updateCount();
        return;
      }
      const items = JSON.parse(json);
      if (Array.isArray(items)) {
        items.forEach((data) => {
          addToPanel(data, { skipSave: true, isRawData: true });
        });
      }
      updateCount();
    } catch (e) {
      console.error("[keep_sheet] Failed to load state", e);
      updateCount();
    }
  }

  // 공용: 패널에 아이템 추가
  // fromItem: DOM Element OR Data Object { source, productId, imgSrc, name, meta }
  function addToPanel(fromItem, options = {}) {
    let source, imgSrc, nameText, metaText, productId;

    if (options.isRawData) {
      source = (fromItem.source || "").trim();
      productId = (fromItem.productId || "").trim();
      imgSrc = fromItem.imgSrc || "";
      nameText = fromItem.name || (source || "LOOK");
      metaText = fromItem.meta || "선택됨 · 피팅 후보";
    } else {
      source = ((fromItem?.dataset?.name || "")).trim();
      productId = ((fromItem?.dataset?.productId || "")).trim();
      const originalImg = fromItem.querySelector("img");
      imgSrc = originalImg ? (originalImg.getAttribute("src") || "") : "";
      nameText = source || "LOOK";
      metaText = options.metaText || "선택됨 · 피팅 후보";
    }

    if (!source) return;
    if (findPanelItemBySource(source)) return;

    const panelItem = document.createElement("div");
    panelItem.className = "panel-item";
    panelItem.dataset.source = source;

    // ✅ productId 저장 (서버 전송/복원용)
    if (productId) panelItem.dataset.productId = productId;

    const imageWrapper = document.createElement("div");
    imageWrapper.className = "panel-item-image-wrapper";

    if (imgSrc) {
      const img = document.createElement("img");
      img.src = imgSrc;
      img.alt = source || "선택한 옷";
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
    name.textContent = nameText;

    const meta = document.createElement("div");
    meta.className = "panel-item-meta";
    meta.textContent = metaText;

    textBox.appendChild(name);
    textBox.appendChild(meta);

    const removeBtn = document.createElement("button");
    removeBtn.className = "panel-item-remove";
    removeBtn.textContent = "×";

    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      panelItem.remove();
      updateCount();
      saveState();

      // Select 페이지에서 하트 동기화(선택)
      if (typeof window.__keepSheetOnRemove === "function") {
        window.__keepSheetOnRemove(source);
      }

      animateHandleNudge();
    });

    panelItem.appendChild(imageWrapper);
    panelItem.appendChild(textBox);
    panelItem.appendChild(removeBtn);

    panelList.appendChild(panelItem);
    updateCount();

    if (!options.skipSave) {
      saveState();
      animateHandleNudge();
    }
  }

  function removeFromPanelBySource(source) {
    const panelItem = findPanelItemBySource(source);
    if (!panelItem) return;
    panelItem.remove();
    updateCount();
    saveState();
    animateHandleNudge();
  }

  function hasItem(source) {
    return !!findPanelItemBySource(source);
  }

  // ====== 서버 전송 ======
  function collectPanelProductIds() {
    return [...panelList.querySelectorAll(".panel-item")]
      .map(el => (el.dataset.productId || "").trim())
      .filter(Boolean);
  }

  async function postKeepToServer(productId) {
    const body = {};
    if (window.SESSION_ID) body.session_id = window.SESSION_ID;
    body.product_id = productId;

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

  function showKeepPopupAndGo() {
    const overlay = document.createElement("div");
    overlay.className = "keep-popup-overlay";

    const box = document.createElement("div");
    box.className = "keep-popup-box";

    const title = document.createElement("div");
    title.className = "keep-popup-title";
    title.textContent = "7번 피팅룸으로 이동해주세요";

    const desc = document.createElement("div");
    desc.className = "keep-popup-desc";
    desc.textContent = "직원이 옷을 준비해놓았습니다";

    box.appendChild(title);
    box.appendChild(desc);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add("visible");
    });

    setTimeout(() => {
      overlay.classList.remove("visible");
      setTimeout(() => {
        overlay.remove();
        window.location.href = "/welcome";
      }, 500);
    }, 2000);
  }

  // ====== export ======
  window.keepSheet = {
    updateCount,
    openPanel,
    closePanel,
    addToPanel,
    removeFromPanelBySource,
    findPanelItemBySource,
    hasItem
  };

  // ====== INITIALIZE ======
  loadState();

  // ====== events ======
  edgeHandle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = edgePanel.classList.toggle("open");
    edgeHandle.classList.toggle("open", isOpen);
  });

  panelCloseButton.addEventListener("click", (e) => {
    e.stopPropagation();
    closePanel();
  });

  // 패널 외 영역 클릭 시 닫기 (오버레이 열려있으면 무시)
  if (mirrorContainer) {
    mirrorContainer.addEventListener("click", (e) => {
      const previewOpen = previewOverlay?.classList?.contains("visible");
      const pickupOpen = pickupOverlay?.classList?.contains("visible");
      if (previewOpen || pickupOpen) return;

      if (!edgePanel.classList.contains("open")) return;

      const clickInsidePanel = edgePanel.contains(e.target);
      const clickOnHandle = edgeHandle.contains(e.target);

      if (!clickInsidePanel && !clickOnHandle) {
        closePanel();
      }
    });
  }

  // 모든 버튼 프레스 효과
  document.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("mousedown", () => btn.classList.add("pressed"));
    btn.addEventListener("mouseup", () => btn.classList.remove("pressed"));
    btn.addEventListener("mouseleave", () => btn.classList.remove("pressed"));
    btn.addEventListener("touchstart", () => btn.classList.add("pressed"), { passive: true });
    btn.addEventListener("touchend", () => btn.classList.remove("pressed"));
  });

  // KEEP 버튼 클릭: 서버 전송 -> 팝업 -> 이동
  if (btnKeep) {
    btnKeep.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (keepBusy) return;
      keepBusy = true;

      try {
        const productIds = collectPanelProductIds();

        if (productIds.length === 0) {
          alert("상품을 먼저 하트로 담아주세요. (product_id 없음)");
          keepBusy = false;
          return;
        }

        await Promise.all(productIds.map(pid => postKeepToServer(pid)));

        showKeepPopupAndGo();
      } catch (err) {
        console.error(err);
        alert("KEEP 전송 실패! (콘솔/Network 확인)");
        keepBusy = false;
      }
    });
  }

})();

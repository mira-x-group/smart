/* keep_sheet.js
   킵시트(패널) 공용 로직
   - open/close
   - panel item add/remove
   - count update
   - outside click close (overlays 열려있으면 무시)
   - pressed effect
   - sessionStorage sync (persistence)
*/

(function () {
  // ====== DOM ======
  const edgePanel = document.getElementById("edgePanel");
  const edgeHandle = document.getElementById("edgeHandle");
  // Badge DOM (Dynamic or Existing)
  let keepBadge = document.getElementById("keepBadge");
  if (!keepBadge && edgeHandle) {
    // create if not exists
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

  // 필수 DOM 없으면 아무것도 안 함 (Result에서도 같은 파일 재사용 가능)
  if (!edgePanel || !edgeHandle || !panelList || !panelCount || !panelCloseButton) return;

  const STORAGE_KEY = "KEEP_SHEET_ITEMS";

  // ====== helpers ======
  function updateCount() {
    const count = panelList.querySelectorAll(".panel-item").length;
    panelCount.textContent = count + "개";

    // 배지 업데이트 Hook
    updateKeepBadge(count);
  }

  // ✅ 1) Nudge Animation (Visual Feedback)
  function animateHandleNudge() {
    if (!edgeHandle) return;

    // Remove class to reset animation if clicking rapidly
    edgeHandle.classList.remove("handle-nudge");

    // Force Reflow
    void edgeHandle.offsetWidth;

    // Add class again
    edgeHandle.classList.add("handle-nudge");

    // Remove after animation (cleanup)
    setTimeout(() => {
      edgeHandle.classList.remove("handle-nudge");
    }, 450); // duration(180+250) approx margins
  }

  // ✅ 2) Badge Update + Pop Animation
  function updateKeepBadge(count) {
    if (!keepBadge) return;

    // Show/Hide Logic
    if (count <= 0) {
      keepBadge.style.display = "none";
      keepBadge.textContent = "0";
    } else {
      keepBadge.style.display = "flex"; // flex for centering
      keepBadge.textContent = count > 99 ? "99+" : count;

      // Pop Animation
      keepBadge.classList.remove("badge-pop");
      void keepBadge.offsetWidth; // force reflow
      keepBadge.classList.add("badge-pop");
    }
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

  // State Persistence
  function saveState() {
    const items = [];
    panelList.querySelectorAll(".panel-item").forEach((item) => {
      const source = item.dataset.source;
      const img = item.querySelector(".panel-item-image-wrapper img");
      const imgSrc = img ? img.getAttribute("src") : "";
      const name = item.querySelector(".panel-item-name")?.textContent || "";
      const meta = item.querySelector(".panel-item-meta")?.textContent || "";

      items.push({ source, imgSrc, name, meta });
    });
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function loadState() {
    try {
      const json = sessionStorage.getItem(STORAGE_KEY);
      if (!json) return;
      const items = JSON.parse(json);
      if (Array.isArray(items)) {
        items.forEach((data) => {
          // Pass plain object as data, with skipSave=true
          addToPanel(data, { skipSave: true, isRawData: true });
        });
      }
    } catch (e) {
      console.error("[keep_sheet] Failed to load state", e);
    }
  }

  // 공용: 패널에 아이템 추가
  // fromItem: DOM Element OR Data Object { source, imgSrc, name, meta }
  function addToPanel(fromItem, options = {}) {
    let source, imgSrc, nameText, metaText;

    if (options.isRawData) {
      // Data Object Mode
      source = fromItem.source;
      imgSrc = fromItem.imgSrc;
      nameText = fromItem.name;
      metaText = fromItem.meta;
    } else {
      // DOM Element Mode
      source = (fromItem?.dataset?.name || "").trim();
      const originalImg = fromItem.querySelector("img");
      imgSrc = originalImg ? originalImg.getAttribute("src") : "";
      nameText = source || "LOOK";
      metaText = options.metaText || "선택됨 · 피팅 후보";
    }

    if (!source) return;
    if (findPanelItemBySource(source)) return;

    const panelItem = document.createElement("div");
    panelItem.className = "panel-item";
    panelItem.dataset.source = source;

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
    name.className = "panel-item-meta"; // Note: class name reused or typo in original? distinct class usually preferred
    // Correction: In original code it was distinct. Let's make sure class is right.
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
      saveState(); // Save after remove

      // Select 페이지에서는 하트 상태도 꺼줘야 함
      if (typeof window.__keepSheetOnRemove === "function") {
        window.__keepSheetOnRemove(source);
      }
    });

    panelItem.appendChild(imageWrapper);
    panelItem.appendChild(textBox);
    panelItem.appendChild(removeBtn);

    panelList.appendChild(panelItem);
    updateCount();

    // ✅ 수정 포인트: 킵할 때 패널을 자동으로 열지 않음
    // Only open panel if it's a user action (not loading from storage)
    if (!options.skipSave) {
      // openPanel();  // ❌ 자동 오픈 제거
      saveState();

      // ✨ User Action -> Trigger Feedback
      animateHandleNudge();
    }
  }

  // 공용: 특정 source 삭제
  function removeFromPanelBySource(source) {
    const panelItem = findPanelItemBySource(source);
    if (!panelItem) return;
    panelItem.remove();
    updateCount();
    saveState();

    // ✨ User Action (Remove) -> Trigger Feedback
    animateHandleNudge();
  }

  // 외부에서 현재 킵된 아이템 목록 확인용
  function hasItem(source) {
    return !!findPanelItemBySource(source);
  }

  // 공용: 외부에서 호출 가능하게 export
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

  // 모든 버튼 공통 프레스 효과 (공용으로 두면 Result에서도 그대로 사용 가능)
  document.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("mousedown", () => btn.classList.add("pressed"));
    btn.addEventListener("mouseup", () => btn.classList.remove("pressed"));
    btn.addEventListener("mouseleave", () => btn.classList.remove("pressed"));
    btn.addEventListener(
      "touchstart",
      () => btn.classList.add("pressed"),
      { passive: true }
    );
    btn.addEventListener("touchend", () => btn.classList.remove("pressed"));
  });


  // KEEP 버튼 클릭 이벤트
  if (btnKeep) {
    btnKeep.addEventListener("click", (e) => {
      e.stopPropagation();
      showKeepPopup();
    });
  }

  function showKeepPopup() {
    // 1. 오버레이 생성
    const overlay = document.createElement("div");
    overlay.className = "keep-popup-overlay";

    // 2. 팝업 박스 생성
    const box = document.createElement("div");
    box.className = "keep-popup-box";

    // 3. 텍스트 추가
    // "7번 피팅룸으로 이동해주세요"
    // "직원이 옷을 준비해놓았습니다"
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

    // 4. 애니메이션 시작 (약간의 지연 후 visible 추가)
    requestAnimationFrame(() => {
      overlay.classList.add("visible");
    });

    // 5. 2초 후 사라지고 페이지 이동
    setTimeout(() => {
      // fade out
      overlay.classList.remove("visible");

      // transition 시간(0.5s) 기다렸다가 이동
      setTimeout(() => {
        overlay.remove();
        // ★ welcome 페이지로 이동
        window.location.href = "/welcome";
      }, 500);

    }, 2000);
  }

})();

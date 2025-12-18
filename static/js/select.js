/* select.js
   Select 전용 로직
   - 프리뷰/선택 (Dynamic Auto-Dismiss Popup)
   - 하트 클릭 -> keepSheet로 위임
   - 착용하기 -> loading 이동
*/

(function () {
  const clothesStrip = document.getElementById("clothesStrip");
  const tryOnButton = document.getElementById("tryOnButton");

  // DOM from user.jpg preview
  const userPreviewImg = document.getElementById("userPreviewImg");
  const userPreviewHint = document.getElementById("userPreviewHint");

  // ===============================================
  // 1. PopupManager: Dynamic Popup for Selection
  // ===============================================
  class PopupManager {
    constructor() {
      this.currentOverlay = null; // 오버레이 DOM
      this.activeTimeout = null;  // Auto dismiss timer
    }

    // 팝업 표시 (기존 팝업 있으면 제거 후 생성)
    show(targetItem) {
      this.clear(); // 기존 팝업 정리

      const source = targetItem.dataset.name || "LOOK";

      // DOM 생성
      // <div class="popup-preview-overlay visible">
      //   <div class="popup-preview-card">
      //      ... content ...
      //   </div>
      // </div>
      const overlay = document.createElement("div");
      overlay.className = "popup-preview-overlay visible"; // 즉시 등장

      const card = document.createElement("div");
      card.className = "popup-preview-card"; // 애니메이션 적용

      // Title Area
      const titleDiv = document.createElement("div");
      const subTitle = document.createElement("div");
      subTitle.className = "preview-title";
      subTitle.textContent = "Processing Selection";
      const mainTitle = document.createElement("div");
      mainTitle.className = "preview-look-name";
      mainTitle.textContent = source;

      titleDiv.appendChild(subTitle);
      titleDiv.appendChild(mainTitle);
      card.appendChild(titleDiv);

      // Image Area
      const imgWrapper = targetItem.querySelector(".cloth-image-wrapper");
      if (imgWrapper) {
        const imgArea = document.createElement("div");
        imgArea.className = "preview-image-area";
        imgArea.appendChild(imgWrapper.cloneNode(true));
        card.appendChild(imgArea);
      }

      // Selected Feedback Text (Optional but good for fallback)
      // "선택됨" 텍스트 or Icon
      const statusDiv = document.createElement("div");
      statusDiv.className = "preview-status";
      statusDiv.textContent = "Selected!";
      card.appendChild(statusDiv);

      overlay.appendChild(card);
      document.body.appendChild(overlay);
      this.currentOverlay = overlay;

      // 애니메이션: 등장 (CSS keyframes 'popupEnter' 처리됨 via className)

      // 1.5초 후 퇴장
      this.activeTimeout = setTimeout(() => {
        this.dismiss(targetItem);
      }, 1500);
    }

    // 팝업 퇴장 (애니메이션 포함)
    dismiss(targetItem) {
      if (!this.currentOverlay) return;

      const overlay = this.currentOverlay;
      const card = overlay.querySelector(".popup-preview-card");

      this.currentOverlay = null; // 참조 끊기

      if (card) {
        // 퇴장 애니메이션 클래스 부여
        card.classList.add("exiting");
        overlay.classList.add("exiting");
      }

      // 애니메이션 시간(300ms) 후 DOM 제거
      setTimeout(() => {
        overlay.remove();
        // ★ Popup이 사라지면서 "최종 선택 상태" 확정 or 유지
        // 시각적으로 이미 선택된 상태로 보임. 추가 동작 필요 시 호출.
        commitSelect(targetItem);
      }, 300);
    }

    // 즉시 정리 (빠른 클릭 시)
    clear() {
      if (this.activeTimeout) {
        clearTimeout(this.activeTimeout);
        this.activeTimeout = null;
      }
      if (this.currentOverlay) {
        this.currentOverlay.remove();
        this.currentOverlay = null;
      }
    }
  }

  const popupManager = new PopupManager();


  // ===============================================
  // 2. Logic: Select / Toggle
  // ===============================================
  let currentSelectedItem = null; // 현재 선택된 DOM

  function toggleSelect(item) {
    // 1) 같은 아이템 재클릭 -> 선택 해제
    if (currentSelectedItem === item) {
      deselectItem(item);
      currentSelectedItem = null;
      // 팝업은 띄우지 않음 (토글 해제)
      return;
    }

    // 2) 다른 아이템 클릭 -> 기존 해제 + 새거 선택
    if (currentSelectedItem) {
      deselectItem(currentSelectedItem);
    }

    // 새 아이템 선택
    selectItem(item);
    currentSelectedItem = item;

    // 팝업 띄우기 (selection confirmation)
    popupManager.show(item);
  }

  // 내부 상태/UI만 변경 (팝업 제외)
  function selectItem(item) {
    if (!item) return;
    item.classList.add("selected");
  }

  function deselectItem(item) {
    if (!item) return;
    item.classList.remove("selected");
  }

  // 팝업 퇴장 후 "확정" 로직 (필요하다면)
  // 현재는 클릭 시점(selectItem)에 이미 UI 반영되므로,
  // 여기서는 로그나 후처리만 담당.
  function commitSelect(item) {
    console.log("Selection Committed:", item.dataset.name);
  }


  // ===============================================
  // 3. Init & Events
  // ===============================================

  // keepSheet Load Check
  if (!window.keepSheet) {
    console.warn("[select.js] keepSheet not loaded.");
  }

  // User Preview Hydration
  function hydrateUserPreview() {
    if (!userPreviewImg) return;
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("photo");
    const fromSession = sessionStorage.getItem("capturedPhotoUrl");
    const url = fromQuery || fromSession;

    if (!url) {
      userPreviewImg.style.display = "none";
      if (userPreviewHint) userPreviewHint.style.display = "block";
      return;
    }

    userPreviewImg.src = url;
    userPreviewImg.onload = () => {
      userPreviewImg.style.display = "block";
      if (userPreviewHint) userPreviewHint.style.display = "none";
    };
    userPreviewImg.onerror = () => {
      userPreviewImg.style.display = "none";
      if (userPreviewHint) {
        userPreviewHint.style.display = "block";
        userPreviewHint.textContent = "촬영 사진 로드 실패";
      }
    };
  }

  // Clothes Grid Hydration
  function hydrateClothesImages() {
    const items = clothesStrip?.querySelectorAll(".cloth-item");
    if (!items) return;

    items.forEach((item, idx) => {
      const n = idx + 1;
      const wrap = item.querySelector(".cloth-image-wrapper");
      if (!wrap) return;
      if (n === 4 || n === 8) return; // Empty slots
      if (wrap.querySelector("img")) return;

      const img = document.createElement("img");
      if (n <= 3) img.src = `/static/tops/top${n}.png`;
      else if (n >= 5 && n <= 7) img.src = `/static/bottoms/bottom${n - 4}.png`;
      else return;

      img.alt = item.dataset.name || `LOOK ${n}`;
      img.loading = "eager";
      wrap.appendChild(img);
    });
  }

  // Init
  hydrateUserPreview();
  hydrateClothesImages();


  // KeepSheet Heart Sync
  function setHeartState(heartBtn, active) {
    if (!heartBtn) return;
    heartBtn.classList.toggle("active", active);
    heartBtn.textContent = active ? "♥" : "♡";
  }

  function hydrateHeartStates() {
    if (!window.keepSheet) return;
    const items = clothesStrip?.querySelectorAll(".cloth-item");
    if (!items) return;
    items.forEach((item) => {
      const source = item.dataset.name;
      if (window.keepSheet.hasItem(source)) {
        const heart = item.querySelector(".cloth-fav");
        if (heart) setHeartState(heart, true);
      }
    });
  }
  hydrateHeartStates();

  window.__keepSheetOnRemove = function (source) {
    const gridItem = [...clothesStrip.querySelectorAll(".cloth-item")].find(
      (ci) => (ci.dataset.name || "") === source
    );
    if (!gridItem) return;
    const heart = gridItem.querySelector(".cloth-fav");
    if (heart) setHeartState(heart, false);
  };


  // ===============================================
  // Event Listeners (Delegation)
  // ===============================================
  clothesStrip?.querySelectorAll(".cloth-item").forEach((item) => {
    // 1. Heart (Keep)
    const favBtn = item.querySelector(".cloth-fav");
    favBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const source = item.dataset.name || "";
      if (favBtn.classList.contains("active")) {
        setHeartState(favBtn, false);
        window.keepSheet?.removeFromPanelBySource(source);
      } else {
        window.keepSheet?.addToPanel(item);
        setHeartState(favBtn, true);
      }
    });

    // 2. Select (Toggle + Popup)
    item.addEventListener("click", (e) => {
      if (e.target.closest(".cloth-fav")) return; // 하트 클릭 무시
      toggleSelect(item);
    });
  });


  // Try On Button
  tryOnButton?.addEventListener("click", (e) => {
    e.stopPropagation();

    // 선택된 아이템 없으면 1번 자동 선택? 
    // "기존 Select 페이지의 다른 기능에 영향 없음" -> 원복
    const targetItem = clothesStrip.querySelector(".cloth-item.selected") ||
      clothesStrip.querySelector('.cloth-item[data-name="LOOK 1"]');

    sessionStorage.removeItem("tryon_top");
    sessionStorage.removeItem("tryon_bottom");

    if (targetItem) {
      const idx = Array.from(clothesStrip.querySelectorAll(".cloth-item")).indexOf(targetItem);
      const n = idx + 1;

      if (n >= 1 && n <= 3) {
        sessionStorage.setItem("tryon_top", `/static/tops/top${n}.png`);
      } else if (n >= 5 && n <= 7) {
        sessionStorage.setItem("tryon_bottom", `/static/bottoms/bottom${n - 4}.png`);
      }
    }

    window.location.href = "/loading";
  });

  // ===============================================
  // 4. Export for STT (Safe Exposure)
  // ===============================================
  window.selectAPI = {
    toggleSelect: (index) => {
      // index: 1-based (1~8)
      // Find item by index
      const item = clothesStrip.querySelectorAll(".cloth-item")[index - 1];
      if (item) {
        toggleSelect(item);
      } else {
        console.warn(`[selectAPI] Item ${index} not found`);
      }
    },

    toggleKeep: (index) => {
      // index: 1-based
      const item = clothesStrip.querySelectorAll(".cloth-item")[index - 1];
      if (item) {
        // reuse the logic: trigger click on favBtn or direct call?
        // Direct call is safer as per requirement esp if event propagation issues
        // Requirement: "toggleKeepBySource 직접 호출"
        // But source is on item
        const source = item.dataset.name || "";
        const favBtn = item.querySelector(".cloth-fav");

        // Logic duplicate from listener to ensure consistency
        if (window.keepSheet.hasItem(source)) {
          window.keepSheet.removeFromPanelBySource(source);
          setHeartState(favBtn, false);
        } else {
          window.keepSheet.addToPanel(item);
          setHeartState(favBtn, true);
        }
      } else {
        console.warn(`[selectAPI] Item ${index} not found`);
      }
    },

    openKeepSheet: () => {
      window.keepSheet?.openPanel();
    },

    closeKeepSheet: () => {
      window.keepSheet?.closePanel();
    },

    tryOn: () => {
      tryOnButton?.click();
    },

    openKeepPopup: () => {
      // .btn-keep click logic fallback or direct implementation?
      // keep_sheet.js has showKeepPopup but it is NOT exported.
      // But btnKeep click triggers it.
      // We can try finding btnKeep and clicking it?
      // Or keep_sheet.js should export it?
      // Requirement says: "만약 btn-keep... 존재하면 그걸 클릭, 없으면 킵시트 열기"
      // So we will handle that logical dispatch in STT js or here.
      // Let's just expose a helper here that STT can call.
      const btnKeep = document.querySelector(".btn-keep");
      if (btnKeep) {
        btnKeep.click();
      } else {
        // Fallback
        window.keepSheet?.openPanel();
      }
    }
  };

})();

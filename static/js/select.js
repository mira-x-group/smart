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
    }
    window.location.href = "loading.html";
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

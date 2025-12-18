const btnBack = document.getElementById("btnBack");

btnBack.addEventListener("click", () => {
  // TODO: 실제 셀렉 화면 파일 이름/경로로 수정
  // 예: select.html, select_screen.html 등
  window.location.href = "select.html";
});

// ───── 킵 패널 동작 (열기/닫기만) ─────
const edgePanel   = document.getElementById("edgePanel");
const edgeHandle  = document.getElementById("edgeHandle");
const panelList   = document.getElementById("panelList");
const panelCount  = document.getElementById("panelCount");
const panelCloseButton = document.getElementById("panelCloseButton");
const feedingButton    = document.getElementById("feedingButton");

function updateCount() {
  const count = panelList.querySelectorAll(".panel-item").length;
  panelCount.textContent = count + "개";
}

edgeHandle.addEventListener("click", () => {
  const isOpen = edgePanel.classList.toggle("open");
  edgeHandle.classList.toggle("open", isOpen);
});

panelCloseButton.addEventListener("click", () => {
  edgePanel.classList.remove("open");
  edgeHandle.classList.remove("open");
});

feedingButton.addEventListener("click", () => {
  const count = panelList.querySelectorAll(".panel-item").length;
  if (count === 0) {
    alert("먼저 셀렉 화면에서 룩을 킵해 주세요.");
    return;
  }
  alert("여기서 선택한 룩을 기반으로 다른 결과를 보여주는 기능을 연결하면 됩니다.");
});

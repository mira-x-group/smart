const video = document.getElementById("cameraFeed");
const canvas = document.getElementById("captureCanvas");
const cameraArea = document.getElementById("cameraArea");

const personOutline = document.getElementById("personOutline");
const alignGuide = document.getElementById("alignGuide");

const scanOverlay = document.getElementById("scanOverlay");
const scanScanned = document.getElementById("scanScanned");
const scanLine = document.getElementById("scanLine");

const captureButton = document.getElementById("captureButton");
const resultButtons = document.getElementById("resultButtons");
const btnRecapture = document.getElementById("btnRecapture");
const btnNext = document.getElementById("btnNext");
const bottomHint = document.getElementById("bottomHint");

const countdownOverlay = document.getElementById("countdownOverlay");
const countdownNumber = document.getElementById("countdownNumber");

let countdownTimer = null;

// 카메라 연결
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: "user" } })
    .then(stream => { video.srcObject = stream; })
    .catch(err => { console.error(err); });
}

function showLiveMode() {
  video.classList.add("visible");
  personOutline.classList.add("visible");
  alignGuide.classList.add("visible");
  canvas.classList.remove("visible");

  captureButton.classList.add("active");
  resultButtons.classList.remove("active");

  bottomHint.textContent = "준비되면 버튼을 눌러 촬영하세요.";

  // 카운트다운 도중 재촬영 눌렀을 때 정리
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  countdownOverlay.classList.remove("visible");
}

function showCapturedMode() {
  const w = video.videoWidth || cameraArea.clientWidth;
  const h = video.videoHeight || cameraArea.clientHeight;
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();

  video.classList.remove("visible");
  personOutline.classList.remove("visible");
  alignGuide.classList.remove("visible");
  canvas.classList.add("visible");

  captureButton.classList.remove("active");
  resultButtons.classList.add("active");

  bottomHint.textContent = "촬영된 화면입니다. 재촬영 또는 다음을 선택하세요.";
}

function startScanAndCapture() {
  // 스캔 시작
  scanOverlay.classList.add("active");
  scanScanned.style.height = "0%";
  scanLine.style.top = "0%";

  // 강제 리플로우 후 애니메이션 시작
  void scanScanned.offsetHeight;
  scanScanned.style.height = "100%";
  scanLine.style.top = "100%";

  const duration = 900; // ms
  setTimeout(() => {
    scanOverlay.classList.remove("active");
    scanScanned.style.height = "0%";
    scanLine.style.top = "0%";

    showCapturedMode();
    captureButton.disabled = false;
  }, duration + 80);
}

// 3초 카운트다운 + 스캔/캡처
function startCountdownAndScan() {
  if (captureButton.disabled) return;

  let count = 3;
  countdownNumber.textContent = count;
  countdownOverlay.classList.add("visible");
  bottomHint.textContent = "3초 뒤 촬영됩니다.";

  captureButton.disabled = true;

  countdownTimer = setInterval(() => {
    count -= 1;

    if (count > 0) {
      countdownNumber.textContent = count;
    } else {
      clearInterval(countdownTimer);
      countdownTimer = null;
      countdownOverlay.classList.remove("visible");
      startScanAndCapture();
    }
  }, 1000);
}

// 촬영 버튼 → 3초 카운트다운 후 스캔 + 캡처
captureButton.addEventListener("click", () => {
  startCountdownAndScan();
});

// 재촬영 → 라이브 모드
btnRecapture.addEventListener("click", () => {
  captureButton.disabled = false;
  showLiveMode();
});

// 캔버스 이미지를 서버에 업로드하는 함수
function uploadCapturedImageAndGoNext() {
  if (!canvas.width || !canvas.height) {
    alert("먼저 사진을 촬영해 주세요.");
    return;
  }

  // canvas → base64 데이터 URL (JPEG)
  const dataURL = canvas.toDataURL("image/jpeg");

  localStorage.setItem("capturedPhoto", dataURL);

  bottomHint.textContent = "사진을 저장 중입니다...";
  btnNext.disabled = true;
  btnRecapture.disabled = true;

  fetch("/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image: dataURL }),
  })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        throw new Error("업로드 실패");
      }
      // 업로드 성공 → select 페이지로 이동
      window.location.href = "/select";
    })
    .catch(err => {
      console.error(err);
      alert("사진 업로드 중 오류가 발생했습니다. 다시 시도해 주세요.");
      btnNext.disabled = false;
      btnRecapture.disabled = false;
      bottomHint.textContent = "촬영된 화면입니다. 재촬영 또는 다음을 선택하세요.";
    });
}

// 다음 버튼 (다음 화면 연결)
btnNext.addEventListener("click", () => {
  uploadCapturedImageAndGoNext();
});

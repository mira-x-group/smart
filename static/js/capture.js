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

// 🔑 현재 화면 상태
var captureState = "LIVE"; // LIVE | CAPTURED

// ============================
// 📷 카메라 연결
// ============================
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  navigator.mediaDevices
    .getUserMedia({ video: { facingMode: "user" } })
    .then(stream => { video.srcObject = stream; })
    .catch(err => { console.error(err); });
}

function showLiveMode() {
  captureState = "LIVE";

  video.classList.add("visible");
  personOutline.classList.add("visible");
  alignGuide.classList.add("visible");
  canvas.classList.remove("visible");

  captureButton.classList.add("active");
  resultButtons.classList.remove("active");

  bottomHint.textContent = "준비되면 버튼을 눌러 촬영하세요.";

  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  countdownOverlay.classList.remove("visible");

  scheduleSTT();
}

function showCapturedMode() {
  captureState = "CAPTURED";

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

  scheduleSTT();
}

function startScanAndCapture() {
  scanOverlay.classList.add("active");
  scanScanned.style.height = "0%";
  scanLine.style.top = "0%";

  void scanScanned.offsetHeight;
  scanScanned.style.height = "100%";
  scanLine.style.top = "100%";

  const duration = 900;
  setTimeout(() => {
    scanOverlay.classList.remove("active");
    scanScanned.style.height = "0%";
    scanLine.style.top = "0%";

    showCapturedMode();
    captureButton.disabled = false;
  }, duration + 80);
}

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

captureButton.addEventListener("click", () => {
  startCountdownAndScan();
});

btnRecapture.addEventListener("click", () => {
  captureButton.disabled = false;
  showLiveMode();
});

function uploadCapturedImageAndGoNext() {
  if (!canvas.width || !canvas.height) {
    alert("먼저 사진을 촬영해 주세요.");
    return;
  }

  const dataURL = canvas.toDataURL("image/jpeg");
  localStorage.setItem("capturedPhoto", dataURL);

  bottomHint.textContent = "사진을 저장 중입니다...";
  btnNext.disabled = true;
  btnRecapture.disabled = true;

  fetch("/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataURL }),
  })
    .then(res => res.json())
    .then(data => {
      if (!data.success) throw new Error("업로드 실패");
      window.location.href = "/select";
    })
    .catch(err => {
      console.error(err);
      alert("사진 업로드 중 오류가 발생했습니다.");
      btnNext.disabled = false;
      btnRecapture.disabled = false;
      bottomHint.textContent = "촬영된 화면입니다. 재촬영 또는 다음을 선택하세요.";
    });
}

btnNext.addEventListener("click", () => {
  uploadCapturedImageAndGoNext();
});


// =====================================================
// 🎙️ STT (Web Speech API) - STATE AWARE VERSION (RECATURE FIX)
// =====================================================
var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
var stt = null;
var sttBusy = false;
var sttCooldownTimer = null;

function initSTT() {
  if (!SpeechRecognition) {
    console.warn("Web Speech API 미지원 (Chrome 필요)");
    return;
  }

  stt = new SpeechRecognition();
  stt.lang = "ko-KR";
  stt.continuous = false;
  stt.interimResults = false;

  stt.onstart = function () {
    sttBusy = true;
    bottomHint.textContent =
      captureState === "LIVE"
        ? "🎙️ '촬영'이라고 말해줘요"
        : "🎙️ '재촬영(다시)' 또는 '다음'이라고 말해줘요";
  };

  stt.onresult = function (event) {
    var text = "";
    if (
      event &&
      event.results &&
      event.results[0] &&
      event.results[0][0] &&
      event.results[0][0].transcript
    ) {
      text = ("" + event.results[0][0].transcript).trim();
    }
    if (!text) return;
    handleVoiceCommand(text);
  };

  stt.onerror = function (e) {
    console.warn("STT error:", e);
    bottomHint.textContent = "마이크 권한 또는 음성 인식 오류입니다.";
  };

  stt.onend = function () {
    sttBusy = false;
    scheduleSTT();
  };
}

function startSTT() {
  if (!stt || sttBusy) return;
  try { stt.start(); } catch (e) {}
}

function scheduleSTT() {
  if (sttCooldownTimer) clearTimeout(sttCooldownTimer);
  sttCooldownTimer = setTimeout(function () {
    startSTT();
  }, 600);
}

function normalize(text) {
  // 공백 제거 + 흔한 구두점 제거(“재촬영.” 같은 케이스 방지)
  return (text || "")
    .replace(/\s+/g, "")
    .replace(/[.,!?~。、“”"'’‘]/g, "");
}

function handleVoiceCommand(raw) {
  var t = normalize(raw);
  console.log("🎙️ voice:", raw, "->", t);

  // (디버깅용) 실제 인식 문장을 잠깐 표시
  // 필요 없으면 아래 줄만 지워도 됨
  // bottomHint.textContent = "인식: " + raw;

  // 촬영
  if (/(촬영|찍어|캡처|사진)/.test(t)) {
    if (captureState !== "LIVE") return;
    captureButton.click();
    return;
  }

  // ✅ 재촬영: "재촬영"뿐 아니라 "다시" 계열까지 폭넓게
  // (CAPTURED 상태에서만 동작)
  if (/(재촬영|재촬|다시|다시찍|다시촬영|처음|리셋)/.test(t)) {
    if (captureState !== "CAPTURED") return;
    btnRecapture.click();
    return;
  }

  // 다음
  if (/(다음|다음으로|넘어가|이동)/.test(t)) {
    if (captureState !== "CAPTURED") return;
    btnNext.click();
    return;
  }

  bottomHint.textContent =
    captureState === "LIVE"
      ? "‘촬영’이라고 말해줘요."
      : "‘재촬영(다시)’ 또는 ‘다음’이라고 말해줘요.";
}

initSTT();

window.addEventListener("load", function () {
  setTimeout(function () {
    scheduleSTT();
  }, 800);
});
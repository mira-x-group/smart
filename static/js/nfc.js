const screenMain  = document.getElementById("screenMain");
const namedropOrb = document.getElementById("namedropOrb");
const waveLayer   = document.getElementById("waveLayer");
const looksPanel  = document.getElementById("looksPanel");

let nfcOpened = false;

function openNFC() {
  nfcOpened = true;

  namedropOrb.classList.remove("active");
  void namedropOrb.offsetWidth;
  namedropOrb.classList.add("active");

  waveLayer.classList.remove("active");
  looksPanel.classList.remove("active");
  void waveLayer.offsetWidth;

  setTimeout(() => {
    waveLayer.classList.add("active");
  }, 120);

  setTimeout(() => {
    looksPanel.classList.add("active");
  }, 260);

  // ✅ NFC 화면이 열린 뒤 1.5초 후 capture 페이지로 이동
  setTimeout(() => {
    window.location.href = "/capture"; // Flask의 @app.route("/capture") 로 이동
  }, 1500); // 시간은 원하면 1000 ~ 2000 으로 조절 가능
}

function closeNFC() {
  nfcOpened = false;
  namedropOrb.classList.remove("active");
  waveLayer.classList.remove("active");
  looksPanel.classList.remove("active");
}

screenMain.addEventListener("click", () => {
  if (!nfcOpened) openNFC();
  else closeNFC();
});

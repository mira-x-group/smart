/* result.js
   Result 페이지 전용 로직
   - 셀렉 화면으로 돌아가기 버튼만 담당
   - 중앙 합성 결과 영역(#resultArea)에 결과 이미지 표시
   - 킵시트 관련 로직은 keep_sheet.js가 전부 처리
*/

(function () {
  // ✅ 중앙 결과 이미지 주입 (새 칸 생성 X: 기존 resultArea에 img만 삽입)
  const resultArea = document.getElementById("resultArea");
  if (resultArea) {
    const params = new URLSearchParams(window.location.search);
    const image = params.get("image");

    if (image) {
      let img = document.getElementById("resultImg");
      if (!img) {
        img = document.createElement("img");
        img.id = "resultImg";
        img.alt = "피팅 결과";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        resultArea.appendChild(img);
      }
      // ✅ (수정) 이미지가 있든 없든 무조건 보이게 설정
      img.style.display = "block";
      img.src = image;
    }
  }

  const btnBack = document.getElementById("btnBack");
  if (!btnBack) return;

  btnBack.addEventListener("click", () => {
    // 실제 Select 페이지 경로에 맞게 수정 가능
    window.location.href = "select";
  });
})();

(async function() {
  try {
    // localStorage에서 선택된 옷 정보 가져오기
    const tryonDataStr = localStorage.getItem('tryonData');
    if (!tryonDataStr) {
      alert('옷 선택 정보가 없습니다.');
      window.location.href = '/select';
      return;
    }

    const tryonData = JSON.parse(tryonDataStr);

    // 사용자 이미지 업로드
    const capturedImage = localStorage.getItem('capturedImage');
    if (capturedImage) {
      await fetch('/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: capturedImage })
      });
    }

    // 옷 경로를 서버 경로 형식으로 변환
    const topPath = tryonData.top ? tryonData.top.replace('/static/', 'static/') : null;
    const bottomPath = tryonData.bottom ? tryonData.bottom.replace('/static/', 'static/') : null;

    // Try-on API 호출
    const response = await fetch('/tryon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ top: topPath, bottom: bottomPath, mode: tryonData.mode })
    });

    const result = await response.json();

    if (result.error) {
      alert('오류: ' + result.error);
      window.location.href = '/select';
      return;
    }

    if (result.result) {
      window.location.href = `/result?image=${encodeURIComponent(result.result)}`;
    } else {
      alert('결과를 생성할 수 없습니다.');
      window.location.href = '/select';
    }

  } catch (error) {
    console.error('Error:', error);
    alert('오류가 발생했습니다: ' + error.message);
    window.location.href = '/select';
  }
})();

from flask import Flask, render_template, request, jsonify, redirect
import os
import base64
import time
from io import BytesIO

from dotenv import load_dotenv
from google import genai
from PIL import Image

# -----------------------------
# 환경 변수 & Gemini 설정
# -----------------------------
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

app = Flask(__name__, template_folder="templates")

# -----------------------------
# 폴더 경로 기본 설정
# -----------------------------
TOP_DIR = "static/tops"
BOTTOM_DIR = "static/bottoms"
OUTFIT_DIR = "static/outfits"  # 현재는 사용 X
USER_IMG = "static/user.jpg"
RESULT_DIR = "static/results"
os.makedirs(RESULT_DIR, exist_ok=True)

# -----------------------------
# Gemini(나노바나나) 클라이언트 설정
# -----------------------------
if not GEMINI_API_KEY:
    print("⚠️ GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.")
    gemini_client = None
else:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)

# 나노바나나 Flash 이미지 모델
GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image"
# 더 고퀄로 가고 싶으면 (요금/쿼터 상관있음):
# GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview"


# -----------------------------
# 공통: Gemini generate_content + 재시도 헬퍼
#   - 429(RESOURCE_EXHAUSTED)일 때 잠깐 쉬고 재시도
# -----------------------------
def gemini_generate_with_retry(model_name, contents, max_retry=3, delay=2):
    """
    Gemini API 호출에 공통으로 쓰는 재시도 헬퍼.
    429(RESOURCE_EXHAUSTED) 발생 시 일정 시간 대기 후 재시도.
    """
    if gemini_client is None:
        print("❌ gemini_client 가 없습니다.")
        return None

    last_exception = None

    for attempt in range(max_retry):
        try:
            response = gemini_client.models.generate_content(
                model=model_name,
                contents=contents,
            )
            return response
        except Exception as e:
            last_exception = e
            msg = str(e)
            # 쿼터 / 레이트 리밋 초과 → 재시도
            if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
                print(f"⚠️ Gemini RESOURCE_EXHAUSTED (429) 발생, 재시도 {attempt+1}/{max_retry}")
                time.sleep(delay)
                continue
            # 그 외 에러는 바로 중단
            print("❌ Gemini generate_content 예외:", e)
            break

    print("❌ Gemini generate_content 최종 실패:", last_exception)
    return None


# -----------------------------
# Gemini: 텍스트 → 이미지 생성 헬퍼 (테스트용)
# -----------------------------
def generate_with_gemini(prompt, filename):
    """
    Gemini(나노바나나)로 이미지를 생성해서 RESULT_DIR에 저장하고,
    최종 파일 경로를 반환. 실패 시 None.
    (단순 프롬프트 테스트용)
    """
    if gemini_client is None:
        print("❌ gemini_client 가 없습니다.")
        return None

    if not prompt.strip():
        print("❌ prompt 가 비어 있습니다.")
        return None

    try:
        response = gemini_generate_with_retry(
            model_name=GEMINI_IMAGE_MODEL,
            contents=[prompt],
        )

        if response is None:
            print("❌ Gemini text2image 응답이 없습니다.")
            return None

        image_bytes = None
        candidates = getattr(response, "candidates", []) or []
        if candidates:
            parts = getattr(candidates[0].content, "parts", []) or []
            for part in parts:
                inline_data = getattr(part, "inline_data", None)
                if inline_data and getattr(inline_data, "data", None):
                    image_bytes = inline_data.data
                    break

        if not image_bytes:
            print("❌ Gemini 응답에서 이미지 데이터를 찾지 못했습니다.")
            return None

        image = Image.open(BytesIO(image_bytes))
        out_path = os.path.join(RESULT_DIR, filename)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        image.save(out_path)
        return out_path

    except Exception as e:
        print("❌ Gemini text2image 오류:", e)
        return None


# -----------------------------
# Gemini: 유저 사진 + 옷 이미지로 편집 헬퍼 (실제 가상 피팅용)
# -----------------------------
def generate_with_gemini_edit(user_image_path, garment_paths, prompt, filename):
    """
    user_image + (선택된 옷 이미지들) + 프롬프트를 사용해서
    '가상 피팅된' 이미지를 생성.

    - user_image_path: static/user.jpg 같은 유저 원본 사진
    - garment_paths: [상의경로, 하의경로] 또는 하나만
    - prompt: 합성에 대한 설명 텍스트
    - filename: RESULT_DIR 아래에 저장할 파일명
    """
    if gemini_client is None:
        print("❌ gemini_client 가 없습니다.")
        return None

    if not os.path.exists(user_image_path):
        print(f"❌ 유저 이미지가 없습니다: {user_image_path}")
        return None

    try:
        contents = [prompt]

        # 1) 유저 사진 추가 (PIL.Image 그대로 넘겨도 SDK에서 처리됨)
        user_img = Image.open(user_image_path)
        contents.append(user_img)

        # 2) 선택된 옷 이미지들 추가 (있으면)
        for path in garment_paths:
            if path and os.path.exists(path):
                img = Image.open(path)
                contents.append(img)
            else:
                print(f"⚠️ 옷 이미지가 없습니다: {path}")

        # 3) Gemini 호출 (429 시 재시도)
        response = gemini_generate_with_retry(
            model_name=GEMINI_IMAGE_MODEL,
            contents=contents,
        )

        if response is None:
            print("❌ Gemini edit 응답이 없습니다.")
            return None

        # 4) 응답에서 이미지 파싱
        image_bytes = None
        candidates = getattr(response, "candidates", []) or []
        if candidates:
            parts = getattr(candidates[0].content, "parts", []) or []
            for part in parts:
                inline_data = getattr(part, "inline_data", None)
                if inline_data and getattr(inline_data, "data", None):
                    image_bytes = inline_data.data
                    break

        if not image_bytes:
            print("❌ Gemini 응답에서 이미지 데이터를 찾지 못했습니다.")
            return None

        out_img = Image.open(BytesIO(image_bytes))
        out_path = os.path.join(RESULT_DIR, filename)
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        out_img.save(out_path)
        return out_path

    except Exception as e:
        print("❌ Gemini edit 오류:", e)
        return None


# -----------------------------
# 1) welcome (처음 화면)
# -----------------------------
@app.route("/")
def welcome():
    return render_template("welcome.html")


# -----------------------------
# 2) index
# -----------------------------
@app.route("/start")
def start_page():
    return render_template("index.html")


# -----------------------------
# 3) capture (사진 촬영)
# -----------------------------
@app.route("/capture")
def capture_page():
    return render_template("capture.html")


# -----------------------------
# 4) review (촬영 결과 확인)
# -----------------------------
@app.route("/review")
def review_page():
    return render_template("review.html")


# -----------------------------
# 5) 사진 업로드
# -----------------------------
@app.route("/upload", methods=["POST"])
def upload_image():
    data = request.get_json()
    img_data = data.get("image")

    header, encoded = img_data.split(",", 1)
    decoded = base64.b64decode(encoded)

    # 유저 사진 저장
    with open(USER_IMG, "wb") as f:
        f.write(decoded)

    return jsonify({"success": True})


# -----------------------------
# 6) select (옷 선택 화면)
# -----------------------------
@app.route("/select")
def select_page():
    tops = [f"/static/tops/{f}" for f in os.listdir(TOP_DIR)]
    bottoms = [f"/static/bottoms/{f}" for f in os.listdir(BOTTOM_DIR)]
    return render_template("select.html", tops=tops, bottoms=bottoms)


# -----------------------------
# 7) loading 화면
# -----------------------------
@app.route("/loading")
def loading_page():
    return render_template("loading.html")


# -----------------------------
# 8-0) (옵션) Gemini 텍스트 테스트용 라우트
# -----------------------------
@app.route("/test_gemini", methods=["POST"])
def test_gemini():
    if gemini_client is None:
        return jsonify({"error": "Gemini API 키가 설정되지 않았습니다."}), 500

    data = request.get_json() or {}
    prompt = (data.get("prompt") or "").strip()

    if not prompt:
        return jsonify({"error": "prompt 가 비어 있습니다."}), 400

    ts = int(time.time())
    filename = f"gemini_test_{ts}.png"

    result_path = generate_with_gemini(prompt, filename)

    if not result_path:
        # 여기서는 429든 다른 오류든 일단 "생성 실패"로 응답
        return jsonify({"error": "Gemini 이미지 생성 실패"}), 500

    result_url = "/" + result_path.replace("\\", "/")
    return jsonify({"result": result_url, "engine": "gemini"})


# -----------------------------
# 8-1) TRY-ON (이제 FASHN X, Gemini O)
#      프론트는 /tryon 그대로 사용
# -----------------------------
@app.route("/tryon", methods=["POST"])
def tryon():
    if gemini_client is None:
        return jsonify({"error": "Gemini API 키가 설정되지 않았습니다."}), 500

    data = request.get_json() or {}

    top_url = data.get("top")
    bottom_url = data.get("bottom")

    # URL("/static/...") → 파일 경로("static/...")
    def to_file_path(url):
        if not url:
            return None
        return url.replace("/static/", "static/")

    top_path = to_file_path(top_url)
    bottom_path = to_file_path(bottom_url)

    # 어떤 모드인지 계산
    if top_path and bottom_path:
        mode = "both"
    elif top_path:
        mode = "top"
    elif bottom_path:
        mode = "bottom"
    else:
        return jsonify({"error": "옷 선택 오류"}), 400

    # 유저 원본 사진 체크
    if not os.path.exists(USER_IMG):
        return jsonify({"error": "유저 사진이 없습니다. 먼저 사진을 촬영/업로드 해주세요."}), 400

    timestamp = int(time.time())

    # 모드에 따라 옷 이미지 리스트와 프롬프트 구성
    garment_paths = []
    base_prompt = (
        "You are a virtual try-on AI. "
        "The first image is a full-body photo of the user. "
        "The following image(s) are clothing items. "
        "Dress the person in the clothing items, keeping the person's face, body shape, "
        "pose and background as natural as possible. High quality e-commerce studio photo."
    )

    if mode == "top":
        garment_paths.append(top_path)
        prompt = base_prompt + " Use only the top garment image."
        result_filename = f"result_top_{timestamp}.png"

    elif mode == "bottom":
        garment_paths.append(bottom_path)
        prompt = base_prompt + " Use only the bottom garment image."
        result_filename = f"result_bottom_{timestamp}.png"

    else:  # both
        garment_paths.extend([top_path, bottom_path])
        prompt = base_prompt + " Use both the top and bottom garment images as a coordinated outfit."
        result_filename = f"result_set_{timestamp}.png"

    # Gemini 기반 가상 피팅 호출
    result_path = generate_with_gemini_edit(
        user_image_path=USER_IMG,
        garment_paths=garment_paths,
        prompt=prompt,
        filename=result_filename,
    )

    if not result_path:
        # 여기서 429 재시도까지 다 실패한 경우도 포함
        return jsonify({"error": "Gemini 합성 실패"}), 500

    result_url = "/" + result_path.replace("\\", "/")
    return jsonify({"result": result_url, "engine": "gemini"})


# -----------------------------
# 9) result 화면
# -----------------------------
@app.route("/result")
def result_page():
    image_path = request.args.get("image")
    if not image_path:
        return "이미지가 없습니다.", 404
    return render_template("result.html", result_image=image_path)


# -----------------------------
# Flask 실행
# -----------------------------
if __name__ == "__main__":
    app.run(debug=True) 
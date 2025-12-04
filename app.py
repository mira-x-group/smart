from flask import Flask, render_template, request, jsonify, redirect, make_response, url_for
import os
import base64
import time
from io import BytesIO
import uuid # ✅ 추가
import json


from dotenv import load_dotenv
from google import genai
from PIL import Image

from models import db, User, Product, Session, ScanLog, DeleteLog   # ✅ 로그 모델 추가

# -----------------------------
# 환경 변수 & Gemini 설정
# -----------------------------
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

app = Flask(__name__, template_folder="templates")

# -----------------------------
# DB 설정 (SQLite)
# -----------------------------
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///db.sqlite3"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db.init_app(app)   # ✅ Flask 앱과 DB 연결

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
# 더 고퀄로 가고 싶으면:
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
# 상품 상세 페이지 (NFC 딥링크 진입용)
# -----------------------------
@app.route("/product/<int:product_id>")
def product_detail(product_id):
    # 1) DB에서 해당 상품 조회 (없으면 404 페이지)
    product = Product.query.get_or_404(product_id)

    # 2) 템플릿에 넘겨서 렌더링
    return render_template("product_detail.html", product=product)

# -----------------------------
# 모바일 상품 진입 (NFC용)
# - 세션 찾고
# - 상품을 세션에 추가하고
# - ScanLog 기록 남기고
# - 최종적으로 /m/session 으로 리다이렉트
# -----------------------------
@app.route("/m/product/<int:product_id>")
def mobile_product(product_id):
    # 1) 상품 DB 조회
    product = Product.query.get_or_404(product_id)

    # 2) 쿠키에서 sessionId 가져오기
    session_id = request.cookies.get("sessionId")

    if not session_id:
        # 세션이 없으면 새로 생성
        session_id = str(uuid.uuid4())
        session = Session(id=session_id)
        db.session.add(session)
    else:
        # 기존 세션 찾기
        session = Session.query.get(session_id)
        if session is None:
            # 쿠키에 있는데 DB에 없으면 새로 생성
            session = Session(id=session_id)
            db.session.add(session)

    # 3) 이 세션에 현재 상품 추가 (중복 허용 X)
    session.add_product(str(product_id))

    # 4) ScanLog 남기기 (고객이 이 상품을 스캔했다는 기록)
    scan_log = ScanLog(session_id=session.id, product_id=product.id)
    db.session.add(scan_log)

    # 5) 커밋
    db.session.commit()

    # 6) /m/session 으로 리다이렉트 (목록 페이지)
    resp = redirect(url_for("mobile_session_page"))
    resp.set_cookie("sessionId", session_id, max_age=3600, httponly=True, samesite="Lax")
    return resp

# -----------------------------
# 모바일 세션 페이지
# - 이 세션에서 스캔한 모든 상품을 한 페이지에서 보여줌
# -----------------------------
@app.route("/m/session")
def mobile_session_page():
    session_id = request.cookies.get("sessionId")

    if not session_id:
        # 아직 아무 것도 스캔 안 한 상태
        return render_template("mobile_session.html", products=[], message="스캔된 상품이 없습니다.")

    session = Session.query.get(session_id)
    if session is None:
        return render_template("mobile_session.html", products=[], message="세션을 찾을 수 없습니다.")

    # ["1","3","2", ...]
    clicked_ids = session.get_clicked_products()
    if not clicked_ids:
        return render_template("mobile_session.html", products=[], message="스캔된 상품이 없습니다.")

    # 문자열 → int 변환 (에러나는 건 건너뛰기)
    int_ids = []
    for pid in clicked_ids:
        try:
            int_ids.append(int(pid))
        except ValueError:
            continue

    # 해당 상품들 조회
    if not int_ids:
        return render_template("mobile_session.html", products=[], message="상품 정보를 찾을 수 없습니다.")

    products = Product.query.filter(Product.id.in_(int_ids)).all()

    # DB는 순서가 뒤죽박죽일 수 있어서, clicked_products 순서대로 다시 정렬
    product_map = {p.id: p for p in products}
    ordered_products = [product_map[pid] for pid in int_ids if pid in product_map]

    return render_template("mobile_session.html", products=ordered_products, message=None)

# -----------------------------
# 모바일 세션에서 특정 상품 삭제
# - 세션.clicked_products 에서 제거
# - DeleteLog 기록 남김
# -----------------------------
@app.route("/m/session/delete/<int:product_id>", methods=["POST"])
def mobile_session_delete(product_id):
    session_id = request.cookies.get("sessionId")
    if not session_id:
        return redirect(url_for("mobile_session_page"))

    session = Session.query.get(session_id)
    if session is None:
        return redirect(url_for("mobile_session_page"))

    # 세션에서 제거
    session.remove_product(str(product_id))

    # 삭제 로그 남기기
    delete_log = DeleteLog(session_id=session.id, product_id=product_id)
    db.session.add(delete_log)

    db.session.commit()

    return redirect(url_for("mobile_session_page"))


@app.route("/m/cart")
def mobile_cart_page():
    """
    현재 브라우저의 sessionId 쿠키를 기준으로
    담긴 상품 목록을 간단히 보여주는 모바일 장바구니 페이지.
    (UI는 임시, 나중에 예쁘게)
    """
    session_id = request.cookies.get("sessionId")

    if not session_id:
        # 세션 쿠키 자체가 없으면 장바구니 비어있다고 처리
        cart_items = []
        session = None
    else:
        session = Session.query.get(session_id)
        if session is None:
            cart_items = []
        else:
            # 이미 만들어둔 helper 재사용
            cart_items = build_cart_items(session)

    return render_template(
        "mobile_cart.html",
        cart_items=cart_items,
        session=session
    )


# -----------------------------
# ✅ Session 기반 API들
# -----------------------------

@app.route("/api/session/init", methods=["POST"])
def init_session():
    """
    웹앱이 생성한 sessionId를 서버에 등록하는 API.
    Body(JSON): { "sessionId": "랜덤UUID" }
    """
    data = request.get_json(silent=True) or {}
    session_id = data.get("sessionId")

    if not session_id:
        return jsonify({"status": "error", "message": "sessionId is required"}), 400

    session = Session.query.get(session_id)
    created = False

    if session is None:
        # 새 세션 생성 (created_at은 models.py에서 default=datetime.utcnow)
        session = Session(id=session_id)
        db.session.add(session)
        db.session.commit()
        created = True

    app.logger.info(f"[Session init] {session_id} (created={created})")

    return jsonify({
        "status": "success",
        "created": created,
        "sessionId": session.id,
    }), 200


@app.route("/api/session/<session_id>/product", methods=["POST"])
def add_clicked_product(session_id):
    """
    세션에 '어떤 상품을 클릭했다'는 기록을 추가.
    Body(JSON): { "productId": "1" } 또는 "P001" 등 문자열 가능
    """
    data = request.get_json(silent=True) or {}
    product_id = data.get("productId")

    if not product_id:
        return jsonify({"status": "error", "message": "productId is required"}), 400

    session = Session.query.get(session_id)
    if session is None:
        return jsonify({"status": "error", "message": "session not found"}), 404

    # 문자열로 저장해두면, P001이든 "1"이든 다 처리 가능
    session.add_product(str(product_id))
    db.session.commit()

    clicked = session.get_clicked_products()
    app.logger.info(f"[Session add product] {session_id}: {clicked}")

    return jsonify({
        "status": "success",
        "sessionId": session.id,
        "clickedProducts": clicked,
    }), 200


@app.route("/api/session/<session_id>", methods=["GET"])
def get_session_info(session_id):
    """
    스마트미러 → 서버
    GET /api/session/:sessionId

    Response:
    {
      "clickedProducts": ["P001", "P003", ...]
    }
    """
    session = Session.query.get(session_id)
    if session is None:
        return jsonify({"status": "error", "message": "session not found"}), 404

    clicked = session.get_clicked_products()

    return jsonify({
        "status": "success",
        "sessionId": session.id,
        "clickedProducts": clicked,
    }), 200


@app.route("/api/product/<int:product_id>", methods=["GET"])
def get_product_api(product_id):
    """
    상품 상세 조회 API
    GET /api/product/1
    JS에서 바로 product.id, product.name ... 으로 접근하게 평평한 구조로 반환
    """
    product = Product.query.get(product_id)
    if product is None:
        return jsonify({"error": "product not found"}), 404

    return jsonify({
        "id": product.id,
        "name": product.name,
        "desc": "",  # 필요하면 나중에 Product 모델에 desc 컬럼 추가해서 채우면 됨
        "imageUrl": f"/static/{product.image_path}",  # ex) /static/tops/top1.jpg
        # 기존 DB는 size/color가 1개라서 배열로 감싸서 넘겨줌
        "sizes": [product.size] if product.size else [],
        "colors": [product.color] if product.color else [],
    }), 200

def build_cart_items(session: Session):
    """
    Session.clicked_products (["1","3","2"...]) 를
    server.js 스타일 cart item 리스트로 변환
    """
    items = session.get_clicked_products()  # ["1","3","2", ...]
    result = []

    for idx, pid in enumerate(items):
        try:
            pid_int = int(pid)
        except ValueError:
            continue

        product = Product.query.get(pid_int)
        if not product:
            continue

        result.append({
            "id": idx,                # 프론트에서 사용할 cartItemId (index 기반)
            "productId": product.id,
            "name": product.name,
            "size": product.size,
            "color": product.color,
            "timestamp": session.created_at.isoformat(),
        })
    return result


@app.route("/api/session/<session_id>/cart", methods=["GET"])
def get_session_cart(session_id):
    """
    대표 server.js의:
    GET /api/session/:sessionId/cart
    과 동일한 역할.
    """
    session = Session.query.get(session_id)
    if session is None:
        # 필요하면 여기서 새로 생성해도 되지만, 우리는 /m/product에서 생성하므로 404로 처리
        return jsonify({"error": "session not found"}), 404

    cart_items = build_cart_items(session)
    return jsonify(cart_items), 200

@app.route("/api/session/<session_id>/add", methods=["POST"])
def add_session_cart_item(session_id):
    """
    세션에 상품 담기
    Body(JSON): { "productId": 1, "size": "...", "color": "..." }
    size/color는 지금은 DB의 product.size/color를 쓰므로 없어도 동작함.
    """
    data = request.get_json(silent=True) or {}
    product_id = data.get("productId")

    if not product_id:
        return jsonify({"error": "productId is required"}), 400

    # 세션 조회 (없으면 생성)
    session = Session.query.get(session_id)
    if session is None:
        session = Session(id=session_id)
        db.session.add(session)

    # Product 존재 확인
    try:
        pid_int = int(product_id)
    except ValueError:
        return jsonify({"error": "invalid productId"}), 400

    product = Product.query.get(pid_int)
    if product is None:
        return jsonify({"error": "product not found"}), 404

    # 세션에 productId 추가 (models.Session.add_product는 문자열 리스트에 append)
    session.add_product(str(product.id))
    db.session.commit()

    # 방금 상태 기준 cartItems 재생성
    cart_items = build_cart_items(session)
    # 마지막 아이템만 돌려주고 싶으면 cart_items[-1]로 해도 됨
    return jsonify(cart_items[-1] if cart_items else {}), 200

@app.route("/api/session/<session_id>/cart/<int:item_id>", methods=["DELETE"])
def delete_session_cart_item(session_id, item_id):
    """
    대표 server.js의:
    DELETE /api/session/:sessionId/cart/:itemId
    와 비슷한 역할.
    여기서는 itemId를 clicked_products 리스트의 index로 사용.
    """
    session = Session.query.get(session_id)
    if session is None:
        return jsonify({"error": "session not found"}), 404

    items = session.get_clicked_products()  # ["1","3","2", ...]

    if item_id < 0 or item_id >= len(items):
        return jsonify({"error": "item not found"}), 404

    # 해당 index 삭제
    removed = items.pop(item_id)
    session.clicked_products = json.dumps(items)
    db.session.commit()

    return jsonify({"success": True, "removed": removed}), 200

# -----------------------------
# 🔍 세션 디버그 페이지
# -----------------------------
@app.route("/debug/session/current")
def debug_current_session():
    """
    현재 브라우저의 sessionId 쿠키 기준으로 세션 상태를 확인하는 페이지.
    """
    session_id = request.cookies.get("sessionId")
    if not session_id:
        return render_template("debug_session.html",
                               session=None,
                               cart_items=[],
                               message="쿠키에 sessionId가 없습니다. /m/product/<id> 를 한번 방문해보세요.")

    session = Session.query.get(session_id)
    if session is None:
        return render_template("debug_session.html",
                               session=None,
                               cart_items=[],
                               message=f"DB에서 sessionId={session_id} 세션을 찾을 수 없습니다.")

    cart_items = build_cart_items(session)
    return render_template("debug_session.html",
                           session=session,
                           cart_items=cart_items,
                           message=None)


@app.route("/debug/session/<session_id>")
def debug_session(session_id):
    """
    특정 sessionId를 직접 넣어서 조회하는 디버그 페이지.
    """
    session = Session.query.get(session_id)
    if session is None:
        return render_template("debug_session.html",
                               session=None,
                               cart_items=[],
                               message=f"DB에서 sessionId={session_id} 세션을 찾을 수 없습니다.")

    cart_items = build_cart_items(session)
    return render_template("debug_session.html",
                           session=session,
                           cart_items=cart_items,
                           message=None)


# -----------------------------
# Flask 실행
# -----------------------------
if __name__ == "__main__":
    # HTTPS(임시 인증서) + 포트 5001로 실행
    app.run(
        debug=True,
        host="0.0.0.0",
        port=5001,
        ssl_context="adhoc",  # Flask가 자동으로 self-signed cert 생성
    )



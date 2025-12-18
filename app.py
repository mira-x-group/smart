from flask import Flask, render_template, request, jsonify, redirect, make_response, url_for
import os
import base64
import time
from io import BytesIO
import uuid
import json
from datetime import datetime, timedelta  # ✅ 세션 TTL용

from dotenv import load_dotenv
from google import genai
from PIL import Image

from models import db, User, Product, Session, ScanLog, DeleteLog

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

db.init_app(app)

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
# 세션 TTL / 쿠키 설정
# -----------------------------
SESSION_TTL_MINUTES = 60          # ✅ 세션 유효 시간 (분)
SESSION_COOKIE_NAME = "sessionId"  # ✅ 쿠키 이름 통일

# cleanup 주기 (초 단위) – 너무 자주 돌면 아까우니까 5분마다
_LAST_CLEANUP_TS = 0


def cleanup_expired_sessions():
    """
    created_at 기준으로 SESSION_TTL_MINUTES 이상 지난 세션을 삭제.
    ✅ Session 레코드만 삭제하고, ScanLog / DeleteLog 는 건드리지 않는다.
    """
    cutoff = datetime.utcnow() - timedelta(minutes=SESSION_TTL_MINUTES)

    # bulk delete 사용해서 ORM이 연관된 DeleteLog.session_id를 NULL로 바꾸려 하지 않게 막기
    deleted_count = (
        Session.query
        .filter(Session.created_at < cutoff)
        .delete(synchronize_session=False)
    )

    if deleted_count:
        print(f"🧹 cleanup_expired_sessions: {deleted_count}개 세션 삭제 완료")

    db.session.commit()


@app.before_request
def before_request_cleanup():
    """
    모든 요청 전에 가볍게 체크해서,
    5분에 한 번씩만 cleanup_expired_sessions() 실행
    """
    global _LAST_CLEANUP_TS
    now_ts = time.time()

    if now_ts - _LAST_CLEANUP_TS > 300:  # 300초 = 5분
        cleanup_expired_sessions()
        _LAST_CLEANUP_TS = now_ts


# -----------------------------
# Gemini 클라이언트 설정
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
# -----------------------------
def gemini_generate_with_retry(model_name, contents, max_retry=3, delay=2):
    """
    Gemini API 호출 재시도 헬퍼.
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
            if "RESOURCE_EXHAUSTED" in msg or "429" in msg:
                print(f"⚠️ Gemini RESOURCE_EXHAUSTED (429) 발생, 재시도 {attempt+1}/{max_retry}")
                time.sleep(delay)
                continue

            print("❌ Gemini generate_content 예외:", e)
            break

    print("❌ Gemini generate_content 최종 실패:", last_exception)
    return None


# -----------------------------
# Gemini: 텍스트 → 이미지 생성 (테스트용)
# -----------------------------
def generate_with_gemini(prompt, filename):
    """
    Gemini로 이미지를 생성해서 RESULT_DIR에 저장하고,
    최종 파일 경로를 반환. 실패 시 None.
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
# Gemini: 유저 사진 + 옷 이미지 편집 (가상 피팅)
# -----------------------------
def generate_with_gemini_edit(user_image_path, garment_paths, prompt, filename):
    """
    user_image + 옷 이미지들 + 프롬프트를 사용해서
    '가상 피팅된' 이미지를 생성.
    """
    if gemini_client is None:
        print("❌ gemini_client 가 없습니다.")
        return None

    if not os.path.exists(user_image_path):
        print(f"❌ 유저 이미지가 없습니다: {user_image_path}")
        return None

    try:
        contents = [prompt]

        # 1) 유저 사진
        user_img = Image.open(user_image_path)
        contents.append(user_img)

        # 2) 옷 이미지
        for path in garment_paths:
            if path and os.path.exists(path):
                img = Image.open(path)
                contents.append(img)
            else:
                print(f"⚠️ 옷 이미지가 없습니다: {path}")

        # 3) Gemini 호출
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
def root():
    return redirect(url_for("welcome_page"))


# -----------------------------
# 1) welcome (처음 화면)
# -----------------------------
@app.route("/welcome")
def welcome_page():
    return render_template("welcome.html")


# -----------------------------
# 2) index
# -----------------------------
@app.route("/nfc")
def nfc_page():
    return render_template("nfc.html")


# -----------------------------
# 3) capture (사진 촬영)
# -----------------------------
@app.route("/capture")
def capture_page():
    return render_template("capture.html")


# -----------------------------
# 4) 사진 업로드
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
# 5) select (옷 선택 화면)
# -----------------------------
@app.route("/select")
def select_page():
    tops = [f"/static/tops/{f}" for f in os.listdir(TOP_DIR)]
    bottoms = [f"/static/bottoms/{f}" for f in os.listdir(BOTTOM_DIR)]
    return render_template("select.html", tops=tops, bottoms=bottoms)


# -----------------------------
# 6) loading 화면
# -----------------------------
@app.route("/loading")
def loading_page():
    return render_template("loading.html")


# -----------------------------
# 7-0) Gemini 텍스트 테스트용
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
        return jsonify({"error": "Gemini 이미지 생성 실패"}), 500

    result_url = "/" + result_path.replace("\\", "/")
    return jsonify({"result": result_url, "engine": "gemini"})


# -----------------------------
# 7-1) TRY-ON (Gemini 기반)
# -----------------------------
@app.route("/tryon", methods=["POST"])
def tryon():
    if gemini_client is None:
        return jsonify({"error": "Gemini API 키가 설정되지 않았습니다."}), 500

    data = request.get_json() or {}

    top_url = data.get("top")
    bottom_url = data.get("bottom")

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
        return jsonify({"error": "Gemini 합성 실패"}), 500

    # ✅ (수정 포인트 1) 결과 이미지 URL을 Flask 정석으로 생성
    # result_path: "static/results/xxx.png" -> static 경로로 접근할 URL 생성
    result_image_url = url_for("static", filename=f"results/{result_filename}")

    # ✅ (수정 포인트 2) result 페이지로 이동할 URL도 같이 내려줌
    # /result?image=/static/results/xxx.png 형태
    result_page_url = url_for("result_page", image=result_image_url)

    # ✅ 기존 프론트 호환을 위해 result 필드는 그대로 유지(이미지 URL)
    return jsonify({
        "result": result_image_url,
        "result_page": result_page_url,
        "engine": "gemini",
        "mode": mode,
    })


# -----------------------------
# 8) result 화면
# -----------------------------
@app.route("/result")
def result_page():
    image = request.args.get("image")
    if not image:
        return "이미지가 없습니다.", 404
    return render_template("result.html", image=image)

# -----------------------------
# ✅ NFC 진입: /m/product/<product_id>
#   1) sessionId 쿠키 생성/유지
#   2) Session.clicked_products 에 product_id 추가
#   3) ScanLog 기록
#   4) /m/session 기본 UI로 리다이렉트
# -----------------------------
@app.route("/m/product/<int:product_id>")
def mobile_product(product_id):
    product = Product.query.get_or_404(product_id)

    # 1) sessionId 쿠키 보장
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    if not session_id:
        session_id = str(uuid.uuid4())

    # Session.id 가 문자열 PK라고 가정
    session = Session.query.get(session_id)
    if session is None:
        session = Session(id=session_id)
        db.session.add(session)

    # 2) 세션에 상품 추가
    session.add_product(str(product.id))

    # 3) ScanLog 기록 (로그는 TTL과 상관없이 계속 저장)
    scan_log = ScanLog(session_id=session.id, product_id=product.id)
    db.session.add(scan_log)

    db.session.commit()

    # 4) /m/session 으로 리다이렉트 + 쿠키 설정
    resp = make_response(redirect(url_for("mobile_session_page")))
    resp.set_cookie(
        SESSION_COOKIE_NAME,
        session_id,
        max_age=SESSION_TTL_MINUTES * 60,  # ✅ 1시간 유지 (상수 사용)
        httponly=True,
        samesite="Lax"
    )
    return resp


# -----------------------------
# 모바일 세션 페이지 (기본 UI)
# -----------------------------
@app.route("/m/session")
def mobile_session_page():
    session_id = request.cookies.get(SESSION_COOKIE_NAME)

    if not session_id:
        return render_template("mobile_session.html", products=[], message="스캔된 상품이 없습니다.")

    session = Session.query.get(session_id)
    if session is None:
        return render_template("mobile_session.html", products=[], message="세션을 찾을 수 없습니다.")

    clicked_ids = session.get_clicked_products()
    if not clicked_ids:
        return render_template("mobile_session.html", products=[], message="스캔된 상품이 없습니다.")

    int_ids = []
    for pid in clicked_ids:
        try:
            int_ids.append(int(pid))
        except ValueError:
            continue

    if not int_ids:
        return render_template("mobile_session.html", products=[], message="상품 정보를 찾을 수 없습니다.")

    products = Product.query.filter(Product.id.in_(int_ids)).all()

    product_map = {p.id: p for p in products}
    ordered_products = [product_map[pid] for pid in int_ids if pid in product_map]

    return render_template("mobile_session.html", products=ordered_products, message=None)


# -----------------------------
# 모바일 세션에서 특정 상품 삭제
# -----------------------------
@app.route("/m/session/delete/<int:product_id>", methods=["POST"])
def mobile_session_delete(product_id):
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    if not session_id:
        return redirect(url_for("mobile_session_page"))

    session = Session.query.get(session_id)
    if session is None:
        return redirect(url_for("mobile_session_page"))

    session.remove_product(str(product_id))

    delete_log = DeleteLog(session_id=session.id, product_id=product_id)
    db.session.add(delete_log)

    db.session.commit()

    return redirect(url_for("mobile_session_page"))


# -----------------------------
# 공용 Session 기반 API
# -----------------------------
@app.route("/api/session/<session_id>", methods=["GET"])
def get_session_info(session_id):
    """
    GET /api/session/<session_id>
    -> clickedProducts 배열 반환
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
    """
    product = Product.query.get(product_id)
    if product is None:
        return jsonify({"error": "product not found"}), 404

    return jsonify({
        "id": product.id,
        "name": product.name,
        "desc": "",
        "imageUrl": f"/static/{product.image_path}",
        "sizes": [product.size] if product.size else [],
        "colors": [product.color] if product.color else [],
    }), 200


def build_cart_items(session: Session):
    """
    Session.clicked_products (["1","3","2"...]) 를
    cart item 리스트로 변환
    """
    items = session.get_clicked_products()
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
            "id": idx,                # index 기반 cartItemId
            "productId": product.id,
            "name": product.name,
            "size": product.size,
            "color": product.color,
            "timestamp": session.created_at.isoformat(),
        })
    return result


@app.route("/api/session/<session_id>/add", methods=["POST"])
def add_session_cart_item(session_id):
    """
    세션에 상품 담기
    POST /api/session/<session_id>/add
    Body: { "productId": 1, ... }
    """
    data = request.get_json(silent=True) or {}
    product_id = data.get("productId")

    if not product_id:
        return jsonify({"error": "productId is required"}), 400

    session = Session.query.get(session_id)
    if session is None:
        session = Session(id=session_id)
        db.session.add(session)

    try:
        pid_int = int(product_id)
    except ValueError:
        return jsonify({"error": "invalid productId"}), 400

    product = Product.query.get(pid_int)
    if product is None:
        return jsonify({"error": "product not found"}), 404

    session.add_product(str(product.id))

    scan_log = ScanLog(session_id=session.id, product_id=product.id)
    db.session.add(scan_log)

    db.session.commit()

    cart_items = build_cart_items(session)
    return jsonify(cart_items[-1] if cart_items else {}), 200


@app.route("/api/session/<session_id>/products", methods=["GET"])
def get_session_products(session_id):
    """
    세션에 담긴 상품 리스트 조회
    GET /api/session/<session_id>/products
    """
    session = Session.query.get(session_id)
    if session is None:
        return jsonify([]), 200

    cart_items = build_cart_items(session)
    return jsonify(cart_items), 200


@app.route("/api/session/<session_id>/products/<int:item_id>", methods=["DELETE"])
def delete_session_product(session_id, item_id):
    """
    세션 상품 삭제
    DELETE /api/session/<session_id>/products/<item_id>
    - item_id는 clicked_products 리스트의 index
    """
    session = Session.query.get(session_id)
    if session is None:
        return jsonify({"error": "session not found"}), 404

    items = session.get_clicked_products()
    if item_id < 0 or item_id >= len(items):
        return jsonify({"error": "item not found"}), 404

    removed = items.pop(item_id)
    session.clicked_products = json.dumps(items)

    try:
        removed_pid = int(removed)
        db.session.add(DeleteLog(session_id=session.id, product_id=removed_pid))
    except ValueError:
        pass

    db.session.commit()

    return jsonify({"success": True, "removed": removed}), 200


# -----------------------------
# 🔍 세션 디버그 페이지
# -----------------------------
@app.route("/debug/session/current")
def debug_current_session():
    session_id = request.cookies.get(SESSION_COOKIE_NAME)

    # 항상 로그는 세션 ID 기준으로 조회 (세션이 삭제되어도 로그는 남아있게)
    logs = []
    if session_id:
        logs = (
            ScanLog.query
            .filter_by(session_id=session_id)
            .order_by(ScanLog.id.desc())   # ✅ created_at 대신 id 기준 내림차순
            .all()
        )

    if not session_id:
        return render_template(
            "debug_session.html",
            session=None,
            cart_items=[],
            logs=logs,
            message="쿠키에 sessionId가 없습니다. /m/product/<id> 를 한번 방문해보세요."
        )

    session = Session.query.get(session_id)
    if session is None:
        # 세션은 TTL로 삭제되었을 수 있지만, logs 는 그대로 보여준다.
        return render_template(
            "debug_session.html",
            session=None,
            cart_items=[],
            logs=logs,
            message=f"DB에서 sessionId={session_id} 세션을 찾을 수 없습니다. (TTL 만료로 삭제되었을 수 있음)"
        )

    cart_items = build_cart_items(session)
    return render_template(
        "debug_session.html",
        session=session,
        cart_items=cart_items,
        logs=logs,
        message=None
    )


@app.route("/debug/session/<session_id>")
def debug_session(session_id):
    session = Session.query.get(session_id)

    logs = (
        ScanLog.query
        .filter_by(session_id=session_id)
        .order_by(ScanLog.id.desc())   # ✅ id 기준 내림차순
        .all()
    )

    if session is None:
        return render_template(
            "debug_session.html",
            session=None,
            cart_items=[],
            logs=logs,
            message=f"DB에서 sessionId={session_id} 세션을 찾을 수 없습니다. (TTL 만료로 삭제되었을 수 있음)"
        )

    cart_items = build_cart_items(session)
    return render_template(
        "debug_session.html",
        session=session,
        cart_items=cart_items,
        logs=logs,
        message=None
    )


# -----------------------------
# Flask 실행
# -----------------------------
if __name__ == "__main__":
    app.run(
        debug=True,
        host="0.0.0.0",
        port=5001,
        ssl_context="adhoc",
    )

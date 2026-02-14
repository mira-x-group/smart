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

# ✅ MirrorLink, KeepEvent 추가 import (기존 기능 영향 없음)
from models import db, User, Product, Session, ScanLog, DeleteLog, MirrorLink, KeepEvent

# -----------------------------
# 환경 변수 & Gemini 설정
# -----------------------------
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

app = Flask(__name__, template_folder="templates")

# -----------------------------
# DB 설정 (환경 변수로 관리)
# -----------------------------
# Render에서는 DATABASE_URL 환경 변수를 제공 (PostgreSQL)
# 로컬 개발 시에는 SQLite 사용
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    # Render PostgreSQL URL 형식: postgresql://user:pass@host/dbname
    # SQLAlchemy는 postgresql:// 형식을 사용하므로 변환 필요
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    app.config["SQLALCHEMY_DATABASE_URI"] = DATABASE_URL
else:
    # 로컬 개발 환경: SQLite 사용
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
SESSION_TTL_MINUTES = 60           # ✅ 세션 유효 시간 (분)
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
def welcome():
    return render_template("welcome.html")


# -----------------------------
# 2) index
# -----------------------------
@app.route("/start")
def start_page():
    mirror_id = request.args.get("mirror_id")
    session_id = request.args.get("session_id")
    return render_template("nfc.html", mirror_id=mirror_id, session_id=session_id)


# -----------------------------
# 3) capture (사진 촬영)
# -----------------------------
@app.route("/capture")
def capture_page():
    mirror_id = request.args.get("mirror_id")
    session_id = request.args.get("session_id")
    return render_template("capture.html", mirror_id=mirror_id, session_id=session_id)



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
    mirror_id = request.args.get("mirror_id")
    session_id = request.args.get("session_id")

    # 폴백(세션 없을 때만 전체 폴더)
    fallback_tops = [f"/static/tops/{f}" for f in os.listdir(TOP_DIR)]
    fallback_bottoms = [f"/static/bottoms/{f}" for f in os.listdir(BOTTOM_DIR)]

    # session_id 없으면 기존처럼 전체 노출 (기존 동작 유지)
    if not session_id:
        return render_template(
            "select.html",
            mirror_id=mirror_id,
            session_id=None,
            tops=fallback_tops,      # 문자열 배열 그대로 OK
            bottoms=fallback_bottoms # 문자열 배열 그대로 OK
        )

    # session_id 있으면: 스마트폰 스캔 세션에서 상품만 가져오기
    s = Session.query.get(session_id)
    if s is None:
        # TTL로 세션이 날아갔을 수 있음 → 폴백 (기존 동작 유지)
        return render_template(
            "select.html",
            mirror_id=mirror_id,
            session_id=session_id,
            tops=fallback_tops,
            bottoms=fallback_bottoms
        )

    clicked_ids = s.get_clicked_products()  # ["1","3",...]
    int_ids = []
    for pid in clicked_ids:
        try:
            int_ids.append(int(pid))
        except ValueError:
            continue

    if not int_ids:
        return render_template(
            "select.html",
            mirror_id=mirror_id,
            session_id=session_id,
            tops=[],
            bottoms=[]
        )

    products = Product.query.filter(Product.id.in_(int_ids)).all()
    product_map = {p.id: p for p in products}
    ordered = [product_map[i] for i in int_ids if i in product_map]

    # ✅ category 기준 분류 ("top"/"bottom" 가정)
    # ✅ 여기서 "문자열 URL"이 아니라 "객체(id 포함)"를 내려줌
    session_tops = []
    session_bottoms = []

    for p in ordered:
        item = {
            "id": p.id,                     # ✅ KEEP에 필요한 값
            "name": p.name,                 # (필요하면 나중에 UI 확장용)
            "image_path": p.image_path,     # 예: "tops/top1.png"  (select.js가 /static 붙임)
            "category": (p.category or "").lower()
        }

        if item["category"] == "top":
            session_tops.append(item)
        elif item["category"] == "bottom":
            session_bottoms.append(item)
        else:
            session_tops.append(item)  # 애매하면 top으로

    return render_template(
        "select.html",
        mirror_id=mirror_id,
        session_id=session_id,
        tops=session_tops,          # ✅ 객체 리스트
        bottoms=session_bottoms     # ✅ 객체 리스트
    )



# -----------------------------
# 6) loading 화면
# -----------------------------
@app.route("/loading")
def loading_page():
    mirror_id = request.args.get("mirror_id")
    session_id = request.args.get("session_id")
    return render_template("loading.html", mirror_id=mirror_id, session_id=session_id)

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

    result_url = "/" + result_path.replace("\\", "/")
    return jsonify({"result": result_url, "engine": "gemini"})


# -----------------------------
# 8) result 화면
# -----------------------------
@app.route("/result")
def result_page():
    image_path = request.args.get("image")
    session_id = request.args.get("session_id")
    mirror_id = request.args.get("mirror_id")

    if not image_path:
        return "이미지가 없습니다.", 404

    return render_template(
        "result.html",
        result_image=image_path,
        session_id=session_id,
        mirror_id=mirror_id
    )



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
        "price": product.price,
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


# ============================================================
# ✅ (추가) MIRROR 연결/조회 기능 (기존 기능 영향 없음)
# - 스마트폰이 /mirror/connect 를 열면 현재 쿠키 sessionId를 미러에 연결
# - 미러(노트북)는 /api/mirror/current 를 폴링해서 sessionId를 얻음
# ============================================================
MIRROR_ID_DEFAULT = "A"

@app.route("/mirror")
def mirror_welcome():
    html = f"""
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Mirror Welcome</title>
  <style>
    body {{
      margin: 0;
      background: #000;
      color: #fff;
      font-family: Arial, sans-serif;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }}
    .box {{
      text-align: center;
      opacity: 0.92;
    }}
    .title {{
      font-size: 56px;
      font-weight: 800;
      letter-spacing: 1px;
      margin-bottom: 18px;
    }}
    .sub {{
      font-size: 20px;
      opacity: 0.75;
    }}
    .hint {{
      margin-top: 26px;
      font-size: 16px;
      opacity: 0.6;
    }}
  </style>
</head>
<body>
  <div class="box">
    <div class="title">WELCOME</div>
    <div class="sub">스마트폰에서 MIRROR CONNECT를 찍어주세요</div>
    <div class="hint">mirror_id: {MIRROR_ID_DEFAULT}</div>
  </div>

  <script>
    const MIRROR_ID = "{MIRROR_ID_DEFAULT}";
    let lastUpdatedAt = null;
    let moved = false;
    let initialized = false; // ✅ 추가: 첫 로드는 기준값만 세팅하고 이동 금지

    async function poll() {{
      if (moved) return;

      try {{
        const res = await fetch(`/api/mirror/current?mirror_id=${{encodeURIComponent(MIRROR_ID)}}`, {{
          cache: "no-store"
        }});
        const data = await res.json();

        // 연결(세션) 없으면 계속 대기
        if (!data.session_id || !data.updated_at) return;

        // ✅ 핵심: 첫 로드에서는 현재 상태를 "기준값"으로만 저장하고 이동하지 않음
        if (!initialized) {{
          lastUpdatedAt = data.updated_at;
          initialized = true;
          return;
        }}

        // ✅ 그 다음부터 updated_at 변경 감지 시에만 이동
        if (data.updated_at !== lastUpdatedAt) {{
          lastUpdatedAt = data.updated_at;

          moved = true;
          const sid = encodeURIComponent(data.session_id);
          window.location.href = `/start?mirror_id=${{encodeURIComponent(MIRROR_ID)}}&session_id=${{sid}}`;
        }}
      }} catch (e) {{
        console.error(e);
      }}
    }}

    setInterval(poll, 300);
    poll();
  </script>
</body>
</html>
"""
    return html



@app.route("/mirror/connect")
def mirror_connect():
    """
    스마트폰이 미러 NFC 태그를 찍으면 열리는 URL.
    (스마트폰 브라우저에서 열리므로 쿠키 sessionId를 서버가 읽을 수 있음)
    """
    mirror_id = request.args.get("mirror_id", MIRROR_ID_DEFAULT)
    session_id = request.cookies.get(SESSION_COOKIE_NAME)

    if not session_id:
        return "세션이 없습니다. 먼저 옷 NFC(/m/product/<id>)를 찍어주세요.", 400

    # 세션이 TTL로 사라졌을 수도 있으니 없으면 만들어둠(기존 기능에 영향 없음)
    s = Session.query.get(session_id)
    if s is None:
        s = Session(id=session_id)
        db.session.add(s)

    link = MirrorLink.query.get(mirror_id)
    if link is None:
        link = MirrorLink(mirror_id=mirror_id)
        db.session.add(link)

    link.set_session(session_id)
    db.session.commit()

    return f"✅ 미러({mirror_id}) 연결 완료! session_id={session_id}"


@app.route("/api/mirror/current")
def api_mirror_current():
    """
    미러(노트북)가 폴링해서 "현재 연결된 session_id"를 가져가는 API
    """
    mirror_id = request.args.get("mirror_id", MIRROR_ID_DEFAULT)
    link = MirrorLink.query.get(mirror_id)

    if not link or not link.session_id:
        return jsonify({"mirror_id": mirror_id, "session_id": None})

    return jsonify({
        "mirror_id": mirror_id,
        "session_id": link.session_id,
        "updated_at": link.updated_at.isoformat()
    })


@app.route("/mirror/session/<session_id>")
def mirror_session_placeholder(session_id):
    html = f"""
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Mirror Session</title>
  <style>
    body {{ font-family: Arial, sans-serif; margin: 20px; }}
    h1 {{ margin: 0 0 10px; }}
    .grid {{ display: grid; grid-template-columns: repeat(4, minmax(180px, 1fr)); gap: 12px; }}
    .card {{ border: 1px solid #ccc; border-radius: 12px; padding: 10px; }}
    .img {{ width: 100%; aspect-ratio: 1 / 1; object-fit: cover; border-radius: 10px; background:#f4f4f4; }}
    .name {{ font-weight: 700; margin-top: 8px; }}
    .meta {{ color: #666; font-size: 14px; }}
    .bar {{ display:flex; align-items:center; justify-content:space-between; margin: 12px 0 18px; }}
    .btn {{ padding: 10px 14px; border-radius: 10px; border: 1px solid #333; cursor:pointer; }}
  </style>
</head>
<body>
  <div class="bar">
    <div>
      <h1>🪞 Mirror</h1>
      <div class="meta">session_id: {session_id}</div>
    </div>
    <div>
      <button class="btn" onclick="location.href='/mirror'">다시 대기화면</button>
    </div>
  </div>

  <h2>📦 담긴 상품</h2>
  <div id="msg" class="meta">불러오는 중...</div>
  <div id="grid" class="grid"></div>

  <script>
    const sessionId = "{session_id}";

    async function load() {{
      const res = await fetch(`/api/session/${{sessionId}}/products`);
      const items = await res.json();

      const msg = document.getElementById("msg");
      const grid = document.getElementById("grid");
      grid.innerHTML = "";

      if (!items.length) {{
        msg.textContent = "담긴 상품이 없습니다. (옷 NFC를 먼저 찍어주세요)";
        return;
      }}

      msg.textContent = `총 ${{items.length}}개 담김`;

      // items는 build_cart_items() 형태: {{productId, name, size, color, ...}}
      for (const it of items) {{
        // product 상세를 더 가져오고 싶으면 api/product 호출
        const pRes = await fetch(`/api/product/${{it.productId}}`);
        const p = await pRes.json();

        const div = document.createElement("div");
        div.className = "card";
        div.innerHTML = `
          <img class="img" src="${{p.imageUrl}}" alt="" />
          <div class="name">${{p.name}}</div>
          <div class="meta">${{(p.colors?.[0] ?? it.color ?? '-') }} / ${{(p.sizes?.[0] ?? it.size ?? '-') }}</div>
        `;
        grid.appendChild(div);
      }}
    }}

    load();
  </script>
</body>
</html>
"""
    return html



# ============================================================
# ✅ KEEP 기능 (기존 기능 영향 없음)
# - POST /api/keep : 쿠키 sessionId 기준으로 KeepEvent 생성
# - GET  /api/keeps?status=open : 직원/디버그 목록 (status 없으면 전체 50개)
# - POST /api/keeps/<id>/ack : 직원 확인 처리
# - /staff : 직원용 대시보드 (templates/staff.html) (폴링)
# ============================================================

@app.route("/api/keep", methods=["POST"])
def api_keep_create():
    data = request.get_json(silent=True) or {}

    # 1) body로 받은 session_id 우선 (미러에서 필수)
    session_id = data.get("session_id")

    # 2) 없으면 쿠키에서 (모바일에서 기존 방식 유지)
    if not session_id:
        session_id = request.cookies.get(SESSION_COOKIE_NAME)

    if not session_id:
        return jsonify({"error": "no session_id (need cookie or JSON session_id)"}), 400

    mirror_id = data.get("mirror_id")

    # product_id는 models.py에서 Integer FK임 → JSON에서 "1" 같이 문자열로 와도 int로 변환 시도
    product_id = data.get("product_id")
    if product_id is not None:
        try:
            product_id = int(product_id)
        except Exception:
            return jsonify({"error": "invalid product_id (must be int)"}), 400

    # 세션이 없으면 만들기
    s = db.session.get(Session, session_id)
    if s is None:
        s = Session(id=session_id)
        db.session.add(s)

    keep = KeepEvent(session_id=session_id, mirror_id=mirror_id, product_id=product_id)
    db.session.add(keep)
    db.session.commit()

    return jsonify({
        "success": True,
        "keep_id": keep.id,
        "session_id": keep.session_id,
        "status": keep.status,
        "created_at": keep.created_at.isoformat()
    }), 200


@app.route("/api/keeps", methods=["GET"])
def api_keeps_list():
    """
    staff.html은 ACK해도 카드가 사라지면 안 되므로
    - staff 화면에서는 status 파라미터 없이 호출(최근 50개 전체)
    - 필요하면 ?status=open 으로 open만도 볼 수 있게 유지
    """
    status = request.args.get("status")  # open/ack/resolved or None
    q = KeepEvent.query

    if status:
        q = q.filter(KeepEvent.status == status)

    keeps = q.order_by(KeepEvent.created_at.desc()).limit(50).all()

    result = []
    for k in keeps:
        p = k.product  # relationship (Product) or None

        # staff UI에서 쓰는 필드들(없으면 None)
        product_name = p.name if p else None
        product_code = str(p.id).zfill(3) if p else (str(k.product_id).zfill(3) if k.product_id is not None else None)

        # Product.image_path는 "tops/top1.jpg" 형태 → URL은 /static/ + image_path
        product_image_url = ("/static/" + p.image_path) if (p and p.image_path) else None

        result.append({
            "id": k.id,
            "session_id": k.session_id,
            "mirror_id": k.mirror_id,
            "product_id": k.product_id,
            "status": k.status,
            "created_at": k.created_at.isoformat(),
            "acked_at": k.acked_at.isoformat() if k.acked_at else None,
            "resolved_at": k.resolved_at.isoformat() if k.resolved_at else None,

            # ✅ staff UI 용 (사진/이름/001)
            "product_name": product_name,
            "product_code": product_code,
            "product_image_url": product_image_url,
        })

    return jsonify(result), 200


@app.route("/api/keeps/<keep_id>/ack", methods=["POST"])
def api_keeps_ack(keep_id):
    keep = KeepEvent.query.get(keep_id)
    if keep is None:
        return jsonify({"error": "keep not found"}), 404

    # 이미 ack/resolved면 그대로 성공 처리(멱등)
    if keep.status != "ack":
        keep.ack()
        db.session.commit()

    return jsonify({"success": True, "id": keep.id, "status": keep.status}), 200


@app.route("/staff")
def staff_dashboard():
    # ✅ app.py 안에 HTML/CSS/JS 두지 않음
    # templates/staff.html 로 분리
    return render_template("staff.html")


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

@app.route("/m/reset")
def mobile_reset_cookie():
    resp = make_response(redirect(url_for("mobile_session_page")))
    resp.set_cookie(SESSION_COOKIE_NAME, "", max_age=0)
    return resp

# ============================================================
# ✅ 관리자용 "DB Browser" 웹 뷰어
# - /admin/db?table=scan_logs&limit=200&offset=0
# - DB Browser처럼 테이블 선택해서 웹에서 row 확인
# ============================================================

ADMIN_TABLES = {
    "users": User,
    "products": Product,
    "sessions": Session,
    "scan_logs": ScanLog,
    "delete_logs": DeleteLog,
    "mirror_links": MirrorLink,
    "keep_events": KeepEvent,
}

def _pick_order_column(Model):
    """
    DB Browser처럼 최근 데이터부터 보이게 정렬 컬럼 선택
    """
    cols = {c.name for c in Model.__table__.columns}
    # 우선순위: 시간 컬럼 -> id
    for name in ["created_at", "scanned_at", "deleted_at", "updated_at", "acked_at", "resolved_at"]:
        if name in cols:
            return name
    if "id" in cols:
        return "id"
    # 없으면 첫 컬럼
    return list(Model.__table__.columns)[0].name

def _serialize_value(v):
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.isoformat(sep=" ", timespec="seconds")
    return str(v)

@app.route("/admin/db")
def admin_db_view():
    table = request.args.get("table", "scan_logs")
    limit = request.args.get("limit", 200, type=int)
    offset = request.args.get("offset", 0, type=int)

    if table not in ADMIN_TABLES:
        table = "scan_logs"

    Model = ADMIN_TABLES[table]

    # columns
    columns = [c.name for c in Model.__table__.columns]

    # query
    order_col = _pick_order_column(Model)
    order_attr = getattr(Model, order_col)

    rows = (
        Model.query
        .order_by(order_attr.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    # serialize rows
    data = []
    for r in rows:
        item = {}
        for c in columns:
            item[c] = _serialize_value(getattr(r, c, None))
        data.append(item)

    # count (총 row 수)
    total = Model.query.count()

    return render_template(
        "admin_db.html",
        tables=list(ADMIN_TABLES.keys()),
        table=table,
        columns=columns,
        rows=data,
        total=total,
        limit=limit,
        offset=offset,
    )


# -----------------------------
# Flask 실행
# -----------------------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5001))
    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )

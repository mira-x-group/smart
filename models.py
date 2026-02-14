from datetime import datetime
import json
import uuid
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False)
    phone = db.Column(db.String(20), nullable=True)


class Product(db.Model):
    __tablename__ = "products"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)

    # "top" 또는 "bottom"
    category = db.Column(db.String(20), nullable=False)

    color = db.Column(db.String(30), nullable=True)
    size = db.Column(db.String(10), nullable=True)
    price = db.Column(db.Integer, nullable=True)

    # static 아래 이미지 경로 (예: "tops/top1.jpg")
    image_path = db.Column(db.String(200), nullable=False)

    def __repr__(self):
        return f"<Product {self.id} {self.name}>"


class Session(db.Model):
    __tablename__ = "sessions"

    # 프론트에서 만든 랜덤 UUID (문자열) 그대로 PK로 사용
    id = db.Column(db.String(64), primary_key=True)  # sessionId

    # 세션 생성 시각 (TTL 계산용)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    # ["1", "3", "2", ...] 이런 배열을 JSON 문자열로 저장
    clicked_products = db.Column(db.Text, default="[]", nullable=False)

    def get_clicked_products(self):
        """JSON 문자열 -> 파이썬 리스트로 변환"""
        try:
            return json.loads(self.clicked_products or "[]")
        except Exception:
            return []

    def add_product(self, product_id: str, allow_duplicate: bool = False):
        """
        clicked_products 리스트에 product_id 추가

        - allow_duplicate=False: 중복 방지
        - allow_duplicate=True: 중복 허용
        """
        items = self.get_clicked_products()
        if not allow_duplicate and product_id in items:
            return

        items.append(product_id)
        self.clicked_products = json.dumps(items, ensure_ascii=False)

    def remove_product(self, product_id: str):
        """clicked_products 리스트에서 product_id 제거"""
        items = self.get_clicked_products()
        if product_id in items:
            items.remove(product_id)
            self.clicked_products = json.dumps(items, ensure_ascii=False)

    def __repr__(self):
        return f"<Session {self.id}>"


class ScanLog(db.Model):
    """
    고객이 NFC 태그를 찍어서 상품이 추가될 때마다 한 줄씩 남기는 로그
    (화면에서 삭제되어도 이 로그는 그대로 유지)
    """
    __tablename__ = "scan_logs"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(64), db.ForeignKey("sessions.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    scanned_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    session = db.relationship("Session", backref=db.backref("scan_logs", lazy=True))
    product = db.relationship("Product", backref=db.backref("scan_logs", lazy=True))

    def __repr__(self):
        return f"<ScanLog s={self.session_id} p={self.product_id} at={self.scanned_at}>"


class DeleteLog(db.Model):
    """
    고객이 화면에서 특정 옷을 삭제(X 버튼)할 때마다 한 줄씩 남기는 로그
    """
    __tablename__ = "delete_logs"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(64), db.ForeignKey("sessions.id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=False)
    deleted_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    session = db.relationship("Session", backref=db.backref("delete_logs", lazy=True))
    product = db.relationship("Product", backref=db.backref("delete_logs", lazy=True))

    def __repr__(self):
        return f"<DeleteLog s={self.session_id} p={self.product_id} at={self.deleted_at}>"


# ============================================================
# MirrorLink: 스마트폰 세션을 "미러"에 연결하는 테이블
# ============================================================
class MirrorLink(db.Model):
    __tablename__ = "mirror_links"

    mirror_id = db.Column(db.String(50), primary_key=True)  # 예: "A"
    session_id = db.Column(db.String(64), db.ForeignKey("sessions.id"), nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    session = db.relationship("Session", backref=db.backref("mirror_links", lazy=True))

    def set_session(self, session_id: str | None):
        self.session_id = session_id
        self.updated_at = datetime.utcnow()

    def __repr__(self):
        return f"<MirrorLink mirror={self.mirror_id} session={self.session_id} at={self.updated_at}>"


# ============================================================
# KeepEvent: KEEP 버튼(직원 호출) 이벤트 로그
# ============================================================
class KeepEvent(db.Model):
    __tablename__ = "keep_events"

    id = db.Column(db.String(64), primary_key=True, default=lambda: uuid.uuid4().hex)
    session_id = db.Column(db.String(64), db.ForeignKey("sessions.id"), nullable=False)

    mirror_id = db.Column(db.String(50), nullable=True)
    product_id = db.Column(db.Integer, db.ForeignKey("products.id"), nullable=True)

    status = db.Column(db.String(20), default="open", nullable=False)  # open/ack/resolved
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    acked_at = db.Column(db.DateTime, nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)

    session = db.relationship("Session", backref=db.backref("keep_events", lazy=True))
    product = db.relationship("Product", backref=db.backref("keep_events", lazy=True))

    def ack(self):
        self.status = "ack"
        self.acked_at = datetime.utcnow()

    def resolve(self):
        self.status = "resolved"
        self.resolved_at = datetime.utcnow()

    def __repr__(self):
        return f"<KeepEvent id={self.id} s={self.session_id} status={self.status} at={self.created_at}>"

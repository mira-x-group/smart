# db_init.py
import os
from app import app
from models import (
    db,
    User,
    Product,
    Session,
    ScanLog,
    DeleteLog,
    MirrorLink,
    KeepEvent,
)

# 기본 미러 ID (app.py랑 맞춰두는 게 좋음)
MIRROR_ID_DEFAULT = "A"


def init_db():
    with app.app_context():
        # ✅ 지금 실제로 어떤 DB를 보고 있는지 출력 (경로 헷갈림 방지)
        try:
            print("🧭 CWD =", os.getcwd())
            print("🧭 DB URI =", app.config.get("SQLALCHEMY_DATABASE_URI"))
            print("🧭 engine.url =", db.engine.url)
        except Exception as e:
            print("⚠️ DB 경로 출력 실패:", e)

        # 1) 전체 테이블 드랍 후 재생성
        print("⚠️ dropping all tables...")
        db.drop_all()

        print("✅ creating all tables...")
        db.create_all()

        # 2) 예시 유저 1명
        me = User(name="이정우", phone="010-0000-0000")
        db.session.add(me)

        # 3) 상의 4개
        tops = [
            Product(
                name="화이트 티셔츠",
                category="top",
                color="white",
                size="M",
                price=19000,
                image_path="tops/top1.jpg",
            ),
            Product(
                name="블랙 티셔츠",
                category="top",
                color="black",
                size="L",
                price=21000,
                image_path="tops/top2.jpg",
            ),
            Product(
                name="네이비 셔츠",
                category="top",
                color="navy",
                size="M",
                price=39000,
                image_path="tops/top3.jpg",
            ),
            Product(
                name="그레이 맨투맨",
                category="top",
                color="gray",
                size="L",
                price=29000,
                image_path="tops/top4.jpg",
            ),
        ]

        # 4) 하의 4개
        bottoms = [
            Product(
                name="슬림 청바지",
                category="bottom",
                color="blue",
                size="30",
                price=39000,
                image_path="bottoms/bottom1.jpg",
            ),
            Product(
                name="블랙 슬랙스",
                category="bottom",
                color="black",
                size="30",
                price=45000,
                image_path="bottoms/bottom2.jpg",
            ),
            Product(
                name="와이드 카고팬츠",
                category="bottom",
                color="khaki",
                size="32",
                price=42000,
                image_path="bottoms/bottom3.jpg",
            ),
            Product(
                name="크림진",
                category="bottom",
                color="cream",
                size="30",
                price=41000,
                image_path="bottoms/bottom4.jpg",
                ),
        ]

        db.session.add_all(tops + bottoms)

        # ✅ MirrorLink 기본 row 하나 만들어두면 /api/mirror/current 폴링할 때 편함
        # (MirrorLink PK가 mirror_id라고 가정)
        try:
            if db.session.get(MirrorLink, MIRROR_ID_DEFAULT) is None:
                db.session.add(MirrorLink(mirror_id=MIRROR_ID_DEFAULT))
        except Exception:
            # 모델 PK 구조가 다르면 여기서 에러 날 수 있어서 안전하게 무시
            pass

        # 5) 세션/로그/keep 이벤트 테이블은 비워둠 (테이블만 생성)
        db.session.commit()

        print("✅ DB 초기화 완료!")
        print("   - User 1명")
        print("   - 상의 4개, 하의 4개")
        print("   - sessions, scan_logs, delete_logs, mirror_links, keep_events 테이블 생성")


if __name__ == "__main__":
    init_db()

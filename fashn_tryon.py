import base64
import requests
import time
import os
from dotenv import load_dotenv

# 환경 변수에서 API 키 로드
load_dotenv()
API_KEY = os.getenv("FASHN_API_KEY")
if not API_KEY:
    print("⚠️ FASHN_API_KEY가 설정되지 않았습니다. 환경 변수를 확인하세요.")

BASE_URL = "https://api.fashn.ai/v1"

def get_headers():
    """API 키를 포함한 헤더 반환"""
    if not API_KEY:
        return None
    return {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

def encode_image(path):
    with open(path, "rb") as f:
        return "data:image/jpeg;base64," + base64.b64encode(f.read()).decode("utf-8")

def run_tryon(model_img_path, garment_img_path, output_filename):
    if not API_KEY:
        print("❌ FASHN_API_KEY가 설정되지 않아 Try-On 기능을 사용할 수 없습니다.")
        return None
        
    print(f"🚀 Fashn Try-On 요청 전송 중... ({garment_img_path})")
    result_dir = "static/results"
    os.makedirs(result_dir, exist_ok=True)
    output_path = os.path.join(result_dir, output_filename)

    try:
        model_b64 = encode_image(model_img_path)
        garment_b64 = encode_image(garment_img_path)

        input_data = {
            "model_name": "tryon-v1.6",
            "inputs": {
                "model_image": model_b64,
                "garment_image": garment_b64,
                "category": "auto",
                "segmentation_free": True,
                "moderation_level": "permissive"
            }
        }

        headers = get_headers()
        if not headers:
            print("❌ API 키가 없어 요청을 보낼 수 없습니다.")
            return None
            
        run_response = requests.post(f"{BASE_URL}/run", json=input_data, headers=headers)
        run_data = run_response.json()
        if "id" not in run_data:
            print("❌ API 호출 실패:", run_data)
            return None
        run_id = run_data["id"]

        while True:
            status_resp = requests.get(f"{BASE_URL}/status/{run_id}", headers=headers).json()
            if status_resp["status"] == "completed":
                print("✅ 합성 완료 →", output_path)
                output_urls = status_resp["output"]
                img_data = requests.get(output_urls[0]).content
                with open(output_path, "wb") as f:
                    f.write(img_data)
                return output_path
            elif status_resp["status"] in ["starting", "in_queue", "processing"]:
                print("⏳ 상태:", status_resp["status"])
                time.sleep(3)
            else:
                print("❌ 실패:", status_resp)
                return None
    except Exception as e:
        print("Try-On API 호출 중 예외 발생:", e)
        return None

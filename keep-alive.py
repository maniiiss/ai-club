import requests
import time
from datetime import datetime

URL = "https://crm.hbgjkt.com/crm/sys/permission/getUserPermissionByToken?_t=1780039964834"
HEADERS = {"x-access-token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IjE4MjQ0MjI4NjYxIiwiZXhwIjoxNzg2MDE5MDA0fQ.mmuTr1t_3koc8ZQmZ4uBD_UM9RPUyRAjgGaVMbRPnrk"}
INTERVAL = 20 * 60  # 20分钟

def ping():
    try:
        resp = requests.get(URL, headers=HEADERS, timeout=10)
        print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {resp.status_code}")
    except Exception as e:
        print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] ERROR: {e}")

if __name__ == "__main__":
    print(f"开始保活，间隔 {INTERVAL // 60} 分钟")
    while True:
        ping()
        time.sleep(INTERVAL)

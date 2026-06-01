import json
import os
import urllib.request

BASE_URL = os.getenv("OPENAI_BASE_URL", "http://127.0.0.1:3001/v1")
API_KEY = os.getenv("OPENAI_API_KEY", "local-not-needed")

payload = {
    "model": os.getenv("HTLM_MODEL", "local"),
    "messages": [{"role": "user", "content": "Say hi in one sentence."}],
    "temperature": 0.2,
}

request = urllib.request.Request(
    f"{BASE_URL}/chat/completions",
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "content-type": "application/json",
        "authorization": f"Bearer {API_KEY}",
    },
    method="POST",
)

with urllib.request.urlopen(request, timeout=120) as response:
    print(response.read().decode("utf-8"))

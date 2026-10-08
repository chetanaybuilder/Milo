import json
from fastapi.testclient import TestClient
from app.main import app
from app.assistant.router import classify
from app.assistant import controller

client = TestClient(app)


def events(resp):
    return [json.loads(l) for l in resp.text.splitlines() if l]


def test_health():
    assert client.get("/api/health").json()["status"] == "ok"


def test_validation():
    assert client.post("/api/chat", json={"message": ""}).status_code == 422
    assert client.post("/api/chat", json={"message": "   "}).status_code == 422
    assert client.post("/api/chat", json={"message": "x" * 2001}).status_code == 422
    assert client.post("/api/chat", content="{bad", headers={"Content-Type": "application/json"}).status_code == 422


def test_routing():
    assert classify("Explain recursion.").kind == "chat"
    assert classify("What is the latest NVIDIA GPU?").kind == "web"
    r = classify("What is the weather in Delhi?")
    assert (r.kind, r.location) == ("weather", "Delhi")
    assert classify("how's the weather").location is None


def test_missing_keys_give_friendly_errors(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    ev = events(client.post("/api/chat", json={"message": "Explain recursion"}))
    assert ev[-2]["message"] == controller.BRAIN_ERR and ev[-1]["type"] == "done"
    ev = events(client.post("/api/chat", json={"message": "latest news on GPUs"}))
    assert ev[0] == {"type": "tool", "tool": "web"} and ev[1]["message"] == controller.SEARCH_ERR


def test_stream_with_fake_provider(monkeypatch):
    class Fake:
        async def stream(self, messages):
            assert messages[0]["role"] == "system" and messages[-1]["content"] == "hi"
            for t in ["Hel", "lo."]:
                yield t
    monkeypatch.setattr(controller, "get_provider", lambda: Fake())
    ev = events(client.post("/api/chat", json={"message": "hi"}))
    assert "".join(e["text"] for e in ev if e["type"] == "token") == "Hello."


def test_weather_and_search_with_fakes(monkeypatch):
    async def fake_weather(loc):
        return {"location": "London, UK", "temperature": 14, "feels_like": 12, "conditions": "light rain",
                "humidity": 80, "wind": 10, "precipitation": 0.1, "timestamp": "t"}
    monkeypatch.setattr(controller, "get_weather", fake_weather)
    ev = events(client.post("/api/chat", json={"message": "weather in London?"}))
    assert [e["type"] for e in ev] == ["tool", "weather", "token", "done"]
    assert "London is currently 14°C" in ev[2]["text"]

    async def fake_search(q):
        return [{"title": "T", "url": "https://x.com/a", "domain": "x.com", "snippet": "s"}]
    class Fake:
        async def stream(self, messages):
            assert "x.com" in messages[0]["content"]
            yield "ok"
    monkeypatch.setattr(controller, "search", fake_search)
    monkeypatch.setattr(controller, "get_provider", lambda: Fake())
    ev = events(client.post("/api/chat", json={"message": "latest news"}))
    assert [e["type"] for e in ev] == ["tool", "sources", "token", "done"]

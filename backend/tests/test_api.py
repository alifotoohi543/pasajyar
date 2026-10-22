import pytest
from conftest import needs_dataset
from fastapi.testclient import TestClient

from app.main import app

pytestmark = needs_dataset


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["shops"] == 6476


def test_understand_rules_fallback(client):
    r = client.post("/api/assist/understand", json={"message": "هندزفری بلوتوث زیر ۳ میلیون", "fast": True})
    body = r.json()
    assert body["source"] == "rules" and body["budget_max"] == 3_000_000 and "هندزفری" in body["keywords"]


def test_search_respects_budget_and_returns_facets(client):
    body = client.get("/api/search", params={"q": "هندزفری بلوتوث", "budget_max": 3_000_000}).json()
    assert body["total"] > 0 and body["facets"]["categories"]
    assert all(p["price"]["min"] is None or p["price"]["min"] <= 3_150_000 for p in body["items"])


def test_installment_filter_only_returns_installment_shops(client):
    pid = client.get("/api/search", params={"q": "هندزفری بلوتوث"}).json()["items"][0]["product_id"]
    offers = client.get(f"/api/products/{pid}/offers", params={"installment": True}).json()
    assert all(o["shop"]["installment"] for o in offers["items"])


def test_offers_are_one_per_shop_and_listing_is_not_stock(client):
    pid = client.get("/api/search", params={"q": "هندزفری بلوتوث"}).json()["items"][0]["product_id"]
    items = client.get(f"/api/products/{pid}/offers").json()["items"]
    shop_ids = [o["shop"]["shop_id"] for o in items]
    assert len(shop_ids) == len(set(shop_ids))
    assert {o["stock"] for o in items} == {"unverified"}
    assert items[0].get("badge")


def test_unknown_product_is_404_in_persian(client):
    r = client.get("/api/products/nope")
    assert r.status_code == 404 and "پیدا نشد" in r.json()["detail"]


def test_inquiry_lifecycle_with_seller_reply(client):
    pid = client.get("/api/search", params={"q": "هندزفری بلوتوث"}).json()["items"][0]["product_id"]
    offers = client.get(f"/api/products/{pid}/offers").json()["items"][:3]
    human_shop = offers[0]["shop"]["shop_id"]
    client.get(f"/api/seller/{human_shop}/inbox")  # claim one shop for a human answer

    r = client.post("/api/inquiries", json={"client_id": "test-client", "product_id": pid,
                                            "offer_ids": [o["offer_id"] for o in offers],
                                            "questions": ["stock", "price"], "visit_at": "18:00"})
    assert r.status_code == 201
    batch_id = r.json()["batch_id"]

    inbox = client.get(f"/api/seller/{human_shop}/inbox").json()["items"]
    mine = next(i for i in inbox if i["batch_id"] == batch_id)
    assert client.post(f"/api/seller/inquiries/{mine['id']}/reply",
                       json={"available": True, "price": 1_000_000, "hold_until": "18:00"}).json()["ok"]

    b = client.get(f"/api/inquiries/{batch_id}").json()
    assert b["counts"]["total"] == 3
    human = next(i for i in b["items"] if i["id"] == mine["id"])
    assert human["reply"]["simulated"] is False and human["reply"]["price"] == 1_000_000
    assert b["agent"]["state"] == "found" and b["agent"]["route"]["stops"]
    client.post(f"/api/seller/{human_shop}/release")


def test_inquiry_rejects_unknown_question(client):
    r = client.post("/api/inquiries", json={"client_id": "test-client", "product_id": "x", "offer_ids": ["y"],
                                            "questions": ["hack"]})
    assert r.status_code == 422

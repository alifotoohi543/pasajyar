"""HTTP API + static SPA hosting for «پاساژیار»."""
from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import catalog, config, db, inquiries, intent, llm
from .i18n import PersianJSONResponse
from .schemas import AssistIn, InquiryIn, RecommendIn, ReplyIn, SortKey

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("pasajyar")

LatQ = Annotated[float | None, Query(ge=-90, le=90)]
LonQ = Annotated[float | None, Query(ge=-180, le=180)]
RadiusQ = Annotated[float | None, Query(gt=0, le=50)]


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not config.APP_DB.exists():
        raise RuntimeError(f"Dataset not found at {config.APP_DB}; run scripts/build_db.py first")
    db.init_state()
    log.info("Loaded %d shops; LLM model=%s cap=$%.2f", len(catalog.shop_index()), config.LLM_MODEL, config.LLM_BUDGET_USD)
    yield


app = FastAPI(title="Pasajyar — in-person shopping assistant", version="1.0.0",
              default_response_class=PersianJSONResponse, lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.middleware("http")
async def headers_and_timing(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.url.path.startswith("/assets/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"  # hashed filenames
    if request.url.path.startswith("/api/"):
        ms = (time.perf_counter() - start) * 1000
        response.headers["Server-Timing"] = f"app;dur={ms:.0f}"
        if ms > 1500:
            log.info("slow %s %s %.0fms", request.method, request.url.path, ms)
    return response


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s", request.url.path)
    return PersianJSONResponse({"detail": "خطای داخلی سرور؛ دوباره تلاش کنید."}, status_code=500)


def where(lat: float | None, lon: float | None) -> tuple[float, float]:
    """User location, falling back to the densest shopping area when unknown."""
    return (lat, lon) if lat is not None and lon is not None else (config.DEFAULT_LAT, config.DEFAULT_LON)


def not_found(what: str) -> HTTPException:
    return HTTPException(404, f"{what} پیدا نشد")


# ---------------------------------------------------------------- meta

@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "shops": len(catalog.shop_index()), "llm": llm.spent()}


@app.get("/api/areas")
def areas():
    return catalog.areas()


@app.get("/api/inquiry-questions")
def questions():
    return inquiries.QUESTIONS


# ---------------------------------------------------------------- step 1: need → products

@app.post("/api/assist/understand")
def understand(body: AssistIn):
    return intent.understand(body.message, use_llm=not body.fast)


@app.post("/api/assist/recommend")
def recommend(body: RecommendIn):
    lat, lon = where(body.lat, body.lon)
    return intent.recommend(body.need, catalog.cards(body.product_ids, lat, lon))


@app.get("/api/search")
def search(q: Annotated[str, Query(min_length=1, max_length=200)],
           budget_min: Annotated[int | None, Query(ge=0)] = None, budget_max: Annotated[int | None, Query(ge=0)] = None,
           category: str | None = None, brand: str | None = None, lat: LatQ = None, lon: LonQ = None,
           radius_km: RadiusQ = None, installment: bool = False,
           alt: Annotated[list[str], Query(max_length=4)] = [],  # noqa: B006 - FastAPI copies defaults
           limit: Annotated[int, Query(ge=1, le=48)] = 24):
    lat, lon = where(lat, lon)
    return catalog.search(q, budget_min, budget_max, category, brand, lat, lon, radius_km, installment,
                          extra_terms=alt[:2], limit=limit)


@app.get("/api/products/{pid}")
def product(pid: str):
    p = catalog.product_detail(pid)
    if p is None:
        raise not_found("محصول")
    return p


@app.get("/api/compare")
def compare(ids: Annotated[list[str], Query(min_length=1, max_length=4)], lat: LatQ = None, lon: LonQ = None):
    lat, lon = where(lat, lon)
    near = catalog.availability(ids, lat, lon, 10)
    out = []
    for pid in ids:
        if p := catalog.product_detail(pid):
            out.append({**p, "near": near.get(pid, dict(catalog.EMPTY_NEAR))})
    return out


# ---------------------------------------------------------------- steps 2–3: shops for a product

@app.get("/api/products/{pid}/offers")
def offers(pid: str, lat: LatQ = None, lon: LonQ = None, radius_km: RadiusQ = None, installment: bool = False,
           open_now: bool = False, warranty: bool = False, sort: SortKey = "best"):
    lat, lon = where(lat, lon)
    out = catalog.rank_offers(pid, lat, lon, radius_km, installment, open_now, warranty, sort)
    out["maybe"] = catalog.maybe_shops(pid, lat, lon)
    return out


@app.get("/api/products/{pid}/alternatives")
def alternatives(pid: str, lat: LatQ = None, lon: LonQ = None, budget_max: int | None = None, installment: bool = False):
    lat, lon = where(lat, lon)
    return catalog.alternatives(pid, lat, lon, budget_max, installment)


@app.get("/api/shops/{shop_id}")
def shop(shop_id: str, lat: LatQ = None, lon: LonQ = None):
    lat, lon = where(lat, lon)
    s = catalog.shop_detail(shop_id, lat, lon)
    if s is None:
        raise not_found("فروشگاه")
    return s


# ---------------------------------------------------------------- step 4: inquiries

@app.post("/api/inquiries", status_code=201)
def create_inquiry(body: InquiryIn):
    lat, lon = where(body.lat, body.lon)
    batch_id = inquiries.create(body.client_id, body.product_id, body.offer_ids, list(body.questions),
                                body.visit_at, body.note, lat, lon)
    if not batch_id:
        raise HTTPException(400, "فروشگاه معتبری برای استعلام انتخاب نشده")
    return {"batch_id": batch_id}


@app.get("/api/inquiries")
def list_inquiries(client_id: Annotated[str, Query(min_length=4, max_length=64)]):
    return inquiries.batches(client_id)


@app.get("/api/inquiries/{batch_id}")
def get_batch(batch_id: str):
    b = inquiries.batch(batch_id)
    if b is None:
        raise not_found("استعلام")
    return b


# ---------------------------------------------------------------- seller panel (demo)

@app.get("/api/seller/shops")
def seller_shops():
    return inquiries.demo_shops()


@app.get("/api/seller/{shop_id}/inbox")
def seller_inbox(shop_id: str):
    s = catalog.shop_index().get(shop_id)
    if s is None:
        raise not_found("فروشگاه")
    return {"shop": catalog.shop_brief(s), "items": inquiries.seller_inbox(shop_id)}


@app.post("/api/seller/inquiries/{inquiry_id}/reply")
def seller_reply(inquiry_id: str, body: ReplyIn):
    if not inquiries.seller_reply(inquiry_id, body.model_dump()):
        raise not_found("استعلام")
    return {"ok": True}


@app.post("/api/seller/{shop_id}/release")
def seller_release(shop_id: str):
    inquiries.release_shop(shop_id)
    return {"ok": True}


# ---------------------------------------------------------------- SPA

if (config.STATIC_DIR / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=config.STATIC_DIR / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise not_found("مسیر")
        f = (config.STATIC_DIR / path).resolve()
        if path and f.is_file() and config.STATIC_DIR.resolve() in f.parents:
            return FileResponse(f)
        return FileResponse(config.STATIC_DIR / "index.html", headers={"Cache-Control": "no-cache"})

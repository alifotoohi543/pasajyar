"""Record the Pasajyar demo video (1920x1080) from the live app.

The app runs inside a phone frame on a "stage" page; a side panel narrates each step and maps it
to the judging rubric. A visible cursor + tap ripple shows every interaction. Output: WebM from
Playwright, converted to MP4 (H.264) plus Persian subtitles (.srt) for an optional voice-over.

Usage (server must be running on :8000):
    .venv/Scripts/python scripts/demo_video/record.py [--base http://localhost:8000] [--deploy-url URL]
"""
from __future__ import annotations

import argparse
import atexit
import inspect
import re
import json
import shutil
import sqlite3
import subprocess
import time
import urllib.parse
import urllib.request
from pathlib import Path

import imageio_ffmpeg
from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "demo"
FONT = ROOT / "frontend/node_modules/@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2"
FONT_LATIN = ROOT / "frontend/node_modules/@fontsource-variable/vazirmatn/files/vazirmatn-latin-wght-normal.woff2"
W, H = 1920, 1080
PHONE_W, PHONE_H, PHONE_SCALE = 390, 844, 1.18

# Scenes are ordered to cover the judging rubric (product, UX, intelligence, deploy, tech, dataset);
# the tags passed to d.step() document that mapping in code only — nothing about scoring is shown on screen.

QUERY_CAMERA = "برای مغازه‌ام دوربین مداربسته می‌خوام، نمی‌دونم چی بگیرم"
QUERY_EARBUDS = "هندزفری بلوتوث برای دویدن زیر ۳ میلیون"

STAGE_HTML = """<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
<style>
@font-face{font-family:Vaz;src:url(/__font-ar.woff2) format('woff2');font-weight:100 900;unicode-range:U+0600-06FF,U+200C-200E,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:Vaz;src:url(/__font-la.woff2) format('woff2');font-weight:100 900}
*{box-sizing:border-box;margin:0}
body{width:1920px;height:1080px;overflow:hidden;font-family:Vaz,Tahoma,sans-serif;color:#1e293b;
 background:radial-gradient(1200px 700px at 85% 10%,#fde3e6 0,transparent 60%),radial-gradient(900px 600px at 10% 90%,#dbeafe 0,transparent 55%),#f8fafc}
.stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:110px;padding:0 120px}
.panel{width:820px;display:flex;flex-direction:column;gap:22px}
.brand{display:flex;align-items:center;gap:14px;font-weight:900;font-size:30px;color:#c42a3b}
.brand img{width:52px;height:52px}
.brand span{font-size:17px;font-weight:600;color:#64748b;margin-inline-start:6px}
.crit{align-self:flex-start;display:inline-flex;gap:10px;align-items:center;background:#d73948;color:#fff;border-radius:999px;padding:8px 20px;font-weight:800;font-size:21px;box-shadow:0 8px 24px rgb(215 57 72/.3)}
.crit b{background:#fff;color:#d73948;border-radius:999px;padding:2px 12px;font-size:18px}
.crit.alt{background:#2563eb;box-shadow:0 8px 24px rgb(37 99 235/.3)} .crit.alt b{color:#2563eb}
h1{font-size:52px;line-height:1.35;font-weight:900}
ul.pts{list-style:none;padding:0;display:flex;flex-direction:column;gap:14px}
ul.pts li{font-size:25px;line-height:1.65;color:#334155;display:flex;gap:14px;opacity:0;transform:translateY(10px);animation:in .5s cubic-bezier(.2,.8,.2,1) forwards}
ul.pts li:before{content:"";flex:none;margin-top:16px;width:10px;height:10px;border-radius:50%;background:#519a23}
.progress{display:flex;gap:8px;margin-top:22px}
.progress i{flex:1;height:8px;border-radius:99px;background:#e2e8f0;transition:background .5s}
.progress i.done{background:#f3a6b0}.progress i.on{background:#d73948}
.phone{position:relative;width:@@pw@@px;height:@@ph@@px;border-radius:@@rad@@px;background:#0f172a;padding:@@bz@@px;box-shadow:0 40px 90px rgb(15 23 42/.35)}
.phone iframe{width:@@iw@@px;height:@@ih@@px;border:0;border-radius:@@irad@@px;background:#fff;transform:scale(@@sc@@);transform-origin:0 0;display:block}
.screen{direction:ltr;width:@@sw@@px;height:@@sh@@px;overflow:hidden;border-radius:@@irad2@@px}
#cursor{position:fixed;z-index:50;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:rgb(15 23 42/.35);border:3px solid #fff;box-shadow:0 2px 10px rgb(0 0 0/.3);pointer-events:none;transition:left .55s cubic-bezier(.2,.8,.2,1),top .55s cubic-bezier(.2,.8,.2,1),transform .15s;left:1500px;top:900px}
#cursor.down{transform:scale(.75)}
.ripple{position:fixed;z-index:49;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #d73948;pointer-events:none;animation:rip .6s ease-out forwards}
@keyframes rip{to{transform:scale(5);opacity:0}}
@keyframes in{to{opacity:1;transform:none}}
#card{position:fixed;inset:0;z-index:60;display:none;flex-direction:column;align-items:center;justify-content:center;gap:26px;text-align:center;
 background:radial-gradient(900px 600px at 50% 30%,#fde3e6,transparent 70%),#fff}
#card.show{display:flex;animation:fade .6s ease both}
#card h2{font-size:84px;font-weight:900;color:#c42a3b}
#card p{font-size:34px;color:#334155;max-width:1300px;line-height:1.7}
#card .chips{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;max-width:1400px}
#card .arch{display:flex;align-items:stretch;gap:18px;justify-content:center}
#card .arch div{background:#fff;border-radius:24px;padding:22px 30px;box-shadow:0 8px 30px rgb(15 23 42/.08);display:flex;flex-direction:column;gap:6px;min-width:330px}
#card .arch div.wide{min-width:1060px}
#card .arch b{font-size:30px;color:#c42a3b}#card .arch span{font-size:21px;color:#475569}
#card .arch i{align-self:center;font-style:normal;font-size:40px;color:#94a3b8}
#card .chips span{background:#fff;border-radius:999px;padding:10px 24px;font-size:24px;font-weight:700;box-shadow:0 4px 16px rgb(15 23 42/.08)}
@keyframes fade{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:none}}
</style></head><body>
<div class="stage">
  <div class="panel">
    <div class="brand"><img src="/favicon.svg" alt="">پاساژیار<span>دستیار هوشمند خرید حضوری · دیتاست ترب</span></div>
    <div id="crit" class="crit">—</div>
    <h1 id="title">—</h1>
    <ul id="pts" class="pts"></ul>
    <div id="progress" class="progress"></div>
  </div>
  <div class="phone"><div class="screen"><iframe id="app" src="about:blank"></iframe></div></div>
</div>
<div id="cursor"></div>
<div id="card"></div>
<script>
const TOTAL = @@total@@;
let n = 0;
document.getElementById('progress').innerHTML = '<i></i>'.repeat(TOTAL);
window.setStep = (alt, title, points) => {
  n += 1;
  const el = document.getElementById('crit');
  el.className = 'crit' + (alt ? ' alt' : '');
  el.innerHTML = `بخش ${n.toLocaleString('fa-IR')} <b>از ${TOTAL.toLocaleString('fa-IR')}</b>`;
  document.getElementById('title').textContent = title;
  document.getElementById('pts').innerHTML = points.map((p, i) => `<li style="animation-delay:${200 + i * 260}ms">${p}</li>`).join('');
  [...document.querySelectorAll('#progress i')].forEach((d, i) => { d.className = i < n - 1 ? 'done' : i === n - 1 ? 'on' : ''; });
};
window.moveCursor = (x, y) => { const c = document.getElementById('cursor'); c.style.left = x + 'px'; c.style.top = y + 'px'; };
window.tapFx = (x, y) => {
  const c = document.getElementById('cursor'); c.classList.add('down'); setTimeout(() => c.classList.remove('down'), 160);
  const r = document.createElement('div'); r.className = 'ripple'; r.style.left = x + 'px'; r.style.top = y + 'px';
  document.body.appendChild(r); setTimeout(() => r.remove(), 700);
};
window.showCard = html => { const c = document.getElementById('card'); c.innerHTML = html; c.classList.add('show'); };
window.hideCard = () => document.getElementById('card').classList.remove('show');
</script></body></html>"""


def stage_html() -> str:
    bezel = 14
    sw, sh = round(PHONE_W * PHONE_SCALE), round(PHONE_H * PHONE_SCALE)
    values = {
        "pw": sw + 2 * bezel, "ph": sh + 2 * bezel, "rad": 56, "bz": bezel, "iw": PHONE_W, "ih": PHONE_H,
        "irad": 0, "irad2": 44, "sc": PHONE_SCALE, "sw": sw, "sh": sh,
        "total": len(re.findall(r"\bd\.step\(", inspect.getsource(scenario))),
    }
    html = STAGE_HTML
    for k, v in values.items():
        html = html.replace(f"@@{k}@@", str(v))
    return html


class Demo:
    def __init__(self, page: Page, base: str):
        self.page, self.base, self.t0 = page, base, time.time()
        self.subs: list[tuple[float, str]] = []
        self.app = page.frame_locator("#app")

    # ---- narration
    def step(self, keys: list[str], title: str, points: list[str]):
        alt = keys[0] in ("smart", "tech")
        self.page.evaluate("([a, t, p]) => setStep(a, t, p)", [alt, title, points])
        self.subs.append((time.time() - self.t0, f"{title} — " + " ".join(points)))
        self.wait(0.8)

    def card(self, html: str, secs: float, sub: str):
        self.page.evaluate("h => showCard(h)", html)
        self.subs.append((time.time() - self.t0, sub))
        self.wait(secs)
        self.page.evaluate("hideCard()")

    def wait(self, s: float):
        self.page.wait_for_timeout(int(s * 1000))

    # ---- app helpers
    @property
    def frame(self):
        return next(f for f in self.page.frames if f.parent_frame is not None)

    def goto(self, path: str, settle: float = 1.2):
        self.frame.goto(self.base + path)
        self.wait(settle)

    def _center(self, loc):
        loc.evaluate("e => e.scrollIntoView({behavior: 'smooth', block: 'center'})")
        self.wait(0.7)
        box = loc.bounding_box()
        return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2

    def tap(self, loc, pause: float = 0.9):
        loc = loc.first
        loc.wait_for(state="visible", timeout=45_000)
        x, y = self._center(loc)
        self.page.evaluate("([x, y]) => moveCursor(x, y)", [x, y])
        self.wait(0.6)
        self.page.evaluate("([x, y]) => tapFx(x, y)", [x, y])
        self.page.mouse.click(x, y)
        self.wait(pause)

    def text(self, s: str, exact: bool = False):
        return self.app.get_by_text(s, exact=exact)

    def role(self, role: str, name: str, exact: bool = False):
        return self.app.get_by_role(role, name=name, exact=exact)

    def type(self, s: str, delay: int = 55):
        self.page.keyboard.type(s, delay=delay)

    def scroll(self, dy: int, pause: float = 1.4):
        self.frame.evaluate("dy => window.scrollBy({top: dy, behavior: 'smooth'})", dy)
        self.wait(pause)

    def scroll_top(self):
        self.frame.evaluate("window.scrollTo({top: 0, behavior: 'smooth'})")
        self.wait(0.9)

    def hover_to(self, loc):
        x, y = self._center(loc.first)
        self.page.evaluate("([x, y]) => moveCursor(x, y)", [x, y])
        self.wait(0.8)


def api(base: str, path: str, body: dict | None = None):
    req = urllib.request.Request(base + path, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"}, method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def scenario(d: Demo, base: str, deploy_url: str | None):
    # Pick the demo product (the Anker earbuds have the most shops near Ferdowsi) and prepare a "human" shop.
    search = api(base, "/api/search?" + urllib.parse.urlencode({"q": "هندزفری بلوتوث انکر R50i NC"}))
    pid = next((p["product_id"] for p in search["items"] if "R50i NC" in p["title"] and p["offer_count"] >= 10),
               search["items"][0]["product_id"])
    top = api(base, f"/api/products/{pid}/offers")["items"][:3]

    # ---------------- intro
    d.card("""<img src="/favicon.svg" style="width:120px"><h2>پاساژیار</h2>
      <p>دستیار هوشمند خرید حضوری از فروشگاه‌ها و پاساژهای تهران — روی دیتاست واقعی ترب</p>
      <div class="chips"><span>۲۲۵٬۹۰۳ کالا</span><span>۳۳۱٬۵۰۶ قیمت ثبت‌شده</span><span>۶٬۴۷۶ فروشگاه</span>
      <span>فارسی · راست‌به‌چپ · موبایل</span></div>""", 6, "پاساژیار — دستیار هوشمند خرید حضوری روی دیتاست واقعی ترب")

    # ---------------- UX: home
    d.goto("/")
    d.step(["ux"], "صفحه اصلی: از همین ابتدا ساده",
           ["کاربر نیازش را به زبان خودش می‌نویسد؛ لازم نیست مدل دقیق را بداند.",
            "موقعیت کاربر (GPS یا محله) مبنای فاصله و زمان رسیدن است.",
            "فیلتر «فقط خرید اقساطی» از صفحه اول در دسترس است."])
    d.wait(2.5)
    d.tap(d.role("button", "میدان فردوسی"))
    d.wait(1.5)
    d.tap(d.text("فردوسی", exact=True))
    d.wait(1.2)
    d.scroll(700, 2.2)
    d.scroll(-700, 1.2)

    # ---------------- Step 1: need → models (product + smart)
    d.step(["smart", "product"], "گام ۱ — «نمی‌دونم چی بگیرم»",
           ["دستیار (LLM) نیاز را به کاربرد، ویژگی‌های لازم و بودجه تبدیل می‌کند.",
            "نکته خرید می‌دهد و برای ابهام، سؤال گزینه‌دار می‌پرسد.",
            "بدون LLM هم با قواعد کار می‌کند؛ هزینه هر فراخوانی ≈ ۰٫۰۰۰۲ دلار با سقف بودجه."])
    d.tap(d.app.locator("#ask"))
    d.type(QUERY_CAMERA)
    d.wait(0.6)
    d.tap(d.role("button", "جستجو"))
    d.text("هوشمند", exact=True).first.wait_for(timeout=60_000)
    d.wait(2.5)
    d.scroll(380, 2.5)
    try:  # answer the assistant's clarifying question (options come from the LLM)
        d.tap(d.role("button", "۳ تا ۴", exact=True).or_(d.role("button", "۱ تا ۲", exact=True)), 1.0)
        d.text("هوشمند", exact=True).first.wait_for(timeout=60_000)
    except Exception as e:  # noqa: BLE001
        print("clarifying question skipped:", e)
    d.wait(2.0)

    d.step(["product", "ux"], "پیشنهاد مدل، با دلیل",
           ["کارت «پیشنهاد دستیار» با دلیل مستند به داده (قیمت، فروشنده، مشخصات).",
            "قیمت میانه و بازه ثبت‌شده، تعداد فروشگاه نزدیک و تازگی قیمت.",
            "بودجه و دسته با یک لمس تغییر می‌کند و نتیجه فوراً به‌روز می‌شود."])
    d.tap(d.app.locator("header button:has(svg.lucide-wallet)"))  # label varies: «بودجه» or «تا … میلیون»
    d.tap(d.app.get_by_role("dialog").get_by_role("button", name="تا ۲۰ میلیون", exact=True), 2.0)
    d.scroll(650, 2.2)
    add = d.app.get_by_role("button", name="افزودن به مقایسه", exact=True)
    d.tap(add.nth(0), 1.2)
    d.tap(add.nth(0), 1.4)  # the first card's label flipped, so nth(0) is now the next card
    d.tap(d.role("button", "مقایسه ۲ کالا"), 2.0)

    d.step(["ux", "product"], "مقایسه کنار‌به‌کنار کالاها",
           ["ردیف‌هایی که بین دو مدل فرق دارند پررنگ می‌شوند.",
            "قیمت، تعداد فروشگاه نزدیک و تعداد فروشگاه باز در این لحظه.",
            "اطلاعات ثبت‌نشده صریحاً «ثبت نشده» نمایش داده می‌شود."])
    d.wait(1.5)
    d.scroll(500, 2.0)
    d.scroll(500, 2.0)

    # ---------------- Step 2: shops near me
    d.goto("/")
    d.step(["product", "data"], "گام ۲ — کدام فروشگاه‌های نزدیک دارند؟",
           ["جستجوی دوم: «هندزفری بلوتوث برای دویدن زیر ۳ میلیون».",
            "فاصله و زمان پیاده/تاکسی از موقعیت کاربر محاسبه می‌شود.",
            "قیمت ثبت‌شده، زمان به‌روزرسانی قیمت و موجودی تأییدشده هرگز یکی گرفته نمی‌شوند."])
    d.tap(d.app.locator("#ask"))
    d.type(QUERY_EARBUDS, 45)
    d.tap(d.role("button", "جستجو"))
    d.text("هوشمند", exact=True).first.wait_for(timeout=60_000)
    d.wait(1.5)
    d.goto(f"/p/{pid}", 2.0)
    d.scroll(420, 2.5)
    d.scroll(420, 2.5)
    d.step(["product", "smart"], "رتبه‌بندی شفاف فروشگاه‌ها",
           ["✓ دلیل‌ها: ارزان‌ترین، نزدیک، باز است، قیمت همین هفته، اقساطی، گارانتی.",
            "⚠ هشدارها: قیمت قدیمی، فروشگاه بسته، قیمت مشکوک یا پرت.",
            "«۳ فروشنده در یک پاساژ» — با یک مراجعه همه را ببین."])
    d.scroll(500, 2.5)
    d.tap(d.role("button", "نزدیک‌ترین"), 2.0)
    d.tap(d.role("button", "پیشنهادی"), 1.5)

    d.step(["product", "data"], "فیلتر اعتبار قسطی و «الان باز»",
           ["فقط فروشگاه‌هایی که ترب‌پی، اسنپ‌پی، دیجی‌پی یا تارا اعلام کرده‌اند.",
            "تعداد فروشگاه‌های پنهان‌شده و دلیلش نمایش داده می‌شود.",
            "نوع اطلاعات مشخص است: «پذیرنده حضوری (اعلام فروشنده)» یا «نامشخص»."])
    d.tap(d.role("button", "قسطی", exact=True), 2.5)
    d.tap(d.role("button", "قسطی", exact=True), 1.2)
    d.tap(d.role("button", "الان باز"), 2.2)
    d.tap(d.role("button", "الان باز"), 1.2)

    d.step(["ux", "data"], "نقشه، جایگزین‌ها و مشخصات",
           ["نقشه با برچسب قیمت ثبت‌شده؛ «؟» یعنی فروشگاه هم‌دسته با موجودی نامشخص.",
            "دسته فعالیت به‌تنهایی نشانه موجود بودن کالا نیست — جدا نمایش داده می‌شود.",
            "کالاهای جایگزین هم‌دسته و هم‌قیمت در فروشگاه‌های اطراف."])
    d.tap(d.role("tab", "نقشه"), 3.5)
    d.tap(d.role("tab", "جایگزین‌ها"), 2.5)
    d.scroll(400, 1.8)
    d.tap(d.role("tab", "مشخصات"), 2.0)
    d.tap(d.role("tab", "فروشگاه‌ها"), 1.5)

    # ---------------- Step 3: compare shops
    d.step(["ux", "product"], "گام ۳ — مقایسه فروشگاه‌ها",
           ["انتخاب سه پیشنهاد برتر با یک لمس.",
            "جدول: قیمت، تازگی قیمت، فاصله، زمان رسیدن، باز/بسته، اقساط، گارانتی، ارسال فوری.",
            "بهترین مقدار هر ردیف سبز است؛ موجودی تا پاسخ فروشنده «تأیید نشده» می‌ماند."])
    d.tap(d.role("button", "انتخاب ۳ پیشنهاد برتر"), 1.5)
    d.tap(d.role("button", "مقایسه", exact=True), 2.5)
    d.app.locator("table").first.evaluate("t => t.parentElement.scrollBy({left: -400, behavior: 'smooth'})")
    d.wait(2.0)

    # ---------------- Step 4: the agent asks the shops
    d.step(["smart"], "گام ۴ — دستیار از فروشگاه‌ها می‌پرسد",
           ["پیام استعلام خودکار: موجودی، قیمت نهایی، اقساط، گارانتی.",
            "به فروشنده خبر می‌دهد مشتری کی می‌آید و می‌خواهد کالا را کنار بگذارد.",
            "شماره کاربر به فروشنده داده نمی‌شود."])
    d.tap(d.role("button", "از همین‌ها بپرس"), 1.5)
    dlg = d.app.get_by_role("dialog")
    d.tap(dlg.get_by_role("button", name="خرید اقساطی", exact=True), 0.6)
    d.tap(dlg.get_by_role("button", name="گارانتی", exact=True), 0.6)
    d.tap(dlg.get_by_role("button", name="فردا عصر", exact=True), 0.8)
    d.tap(dlg.get_by_role("button", name="پیش‌نمایش پیام"), 2.5)
    d.tap(d.role("button", "ارسال و پیگیری توسط دستیار"), 0.2)
    # Claim one shop of this batch right away (simulated replies take ≥8s) so it is answered by hand later.
    for _ in range(150):  # wait until the app navigated to the tracking page
        if "/track/" in d.frame.url:
            break
        d.wait(0.1)
    batch_id = d.frame.url.rstrip("/").split("/")[-1]
    human_shop = api(base, f"/api/inquiries/{batch_id}")["items"][-1]["shop"]["shop_id"]
    api(base, f"/api/seller/{human_shop}/inbox")
    d.wait(1.8)

    d.step(["smart", "product"], "پیگیری زنده پاسخ‌ها",
           ["هر فروشگاه: ارسال شد ← دیده شد ← پاسخ داد.",
            "قیمت اعلام‌شده امروز در برابر قیمت ثبت‌شده در ترب.",
            "پاسخ‌های دمو شبیه‌سازی‌شده‌اند (شماره‌های دیتاست جعلی است) و برچسب دارند."])
    try:
        d.text("موجودی را تأیید").first.wait_for(timeout=40_000)
    except Exception:  # noqa: BLE001 - keep recording even if no simulated shop confirmed
        print("no confirmation within 40s")
    d.wait(2.5)
    d.step(["smart"], "تصمیم و قدم بعدی، با دستیار",
           ["بهترین گزینه تأییدشده: ترکیب قیمت تأییدشده و فاصله.",
            "برنامه مراجعه چندتوقفی با لینک مسیریابی گوگل‌مپ.",
            "اگر کسی کالا را نداشت: فروشگاه‌های دیگر و کالای جایگزین پیشنهاد می‌شود."])
    d.scroll(450, 2.5)
    d.scroll(550, 2.5)
    batch_url = d.frame.url

    # ---------------- seller panel
    d.step(["product", "smart"], "سمت فروشنده: پنل پاسخ",
           ["فروشنده پیام دستیار و زمان مراجعه مشتری را می‌بیند.",
            "با یک لمس «موجود است»، قیمت امروز و کنار گذاشتن کالا را ثبت می‌کند.",
            "پاسخ بلافاصله در صفحه پیگیری کاربر و تصمیم دستیار اثر می‌گذارد."])
    d.goto(f"/seller?shop={human_shop}", 2.0)
    d.scroll(380, 1.8)
    d.tap(d.role("button", "ارسال پاسخ به مشتری"), 2.5)
    d.frame.goto(batch_url)
    d.wait(2.0)
    d.text("پاسخ مستقیم فروشنده").first.evaluate("e => e.scrollIntoView({behavior: 'smooth', block: 'center'})")
    d.wait(3.0)

    # ---------------- shop page: how to find it
    d.goto(f"/shop/{top[0]['shop']['shop_id']}", 1.5)
    d.step(["product", "ux", "data"], "پیدا کردن مغازه داخل پاساژ",
           ["آدرس به پاساژ ← طبقه ← واحد/پلاک تجزیه می‌شود.",
            "مسیریابی با گوگل‌مپ، نشان و بلد؛ و اگر مغازه پیدا نشد: جستجوی نام پاساژ.",
            "ساعت کاری هفته، شرایط پرداخت و «نامشخص»‌ها همه شفاف."])
    d.wait(2.0)
    d.scroll(520, 2.5)
    d.scroll(560, 2.5)
    d.scroll(560, 2.2)

    # ---------------- technical implementation
    d.step(["tech"], "پیاده‌سازی فنی",
           ["FastAPI + SQLite FTS5 با نرمال‌سازی فارسی؛ پاسخ جستجو ≈ ۴۰ میلی‌ثانیه.",
            "LLM با کش، سقف هزینه و fallback قاعده‌محور؛ ۲۳ تست خودکار.",
            "React + Tailwind، بارگذاری تنبل صفحات، ErrorBoundary، انیمیشن با احترام به reduced-motion."])
    d.wait(3.0)
    d.card("""<h2 style="font-size:64px">زیر کاپوت پاساژیار</h2>
      <div class="arch">
        <div><b>رابط کاربری</b><span>React · Tailwind · RTL · موبایل‌محور</span><span>بارگذاری تنبل صفحات و نقشه</span></div>
        <i>⟵</i>
        <div><b>API</b><span>FastAPI · اعتبارسنجی Pydantic</span><span>رتبه‌بندی شفاف با دلیل و هشدار</span></div>
        <i>⟵</i>
        <div><b>داده</b><span>SQLite + FTS5 · نرمال‌سازی فارسی</span><span>۲۲۵ هزار کالا · ۳۳۱ هزار قیمت</span></div>
      </div>
      <div class="arch"><div class="wide"><b>دستیار هوشمند</b><span>LLM برای فهم نیاز و پیشنهاد مدل · کش پاسخ · سقف هزینه · جایگزین قاعده‌محور</span></div></div>
      <div class="chips"><span>جستجو ≈ ۴۰ میلی‌ثانیه</span><span>۲۳ تست خودکار</span><span>پاکسازی ۱۹ هزار قیمت نامعتبر</span><span>Docker</span></div>""",
           9, "زیر کاپوت: React، FastAPI، SQLite FTS5 و LLM با کش و سقف هزینه")

    # ---------------- deploy + outro
    d.step(["deploy"], "اجرا در محیط عملیاتی",
           ["Docker چندمرحله‌ای: ساخت فرانت، ساخت دیتابیس از CSV ترب، اجرای سرور.",
            "روی لیارا؛ کلید LLM و سقف بودجه از متغیرهای محیطی.",
            "Healthcheck و هدرهای کش/امنیتی آماده محیط عملیاتی."])
    d.goto("/", 3.0)
    url_line = f"<p>{deploy_url}</p>" if deploy_url else "<p>Docker · Liara · FastAPI · React</p>"
    d.card(f"""<img src="/favicon.svg" style="width:110px"><h2>پاساژیار</h2>
      <p>نیاز را بگو ← فروشگاه نزدیک ← مقایسه شفاف ← دستیار می‌پرسد و پیگیری می‌کند</p>{url_line}
      <div class="chips"><span>فهم نیاز با هوش مصنوعی</span><span>فروشگاه‌های نزدیک</span><span>مقایسه شفاف</span>
      <span>فیلتر اقساطی</span><span>استعلام و پیگیری</span><span>پنل فروشنده</span><span>مسیریابی داخل پاساژ</span></div>""", 6, "جمع‌بندی: نیاز ← فروشگاه نزدیک ← مقایسه ← استعلام و پیگیری")

    api(base, f"/api/seller/{human_shop}/release", {})


DEMO_PORT = 8001
DEMO_ENV = {  # demo-only seller simulation: shops reply within seconds, even outside opening hours
    "SIM_SEEN_S": "2", "SIM_REPLY_MIN_S": "5", "SIM_REPLY_MAX_S": "12", "SIM_TIMEOUT_S": "25",
    "SIM_SILENT_CLOSED_P": "0.1", "SIM_SILENT_OPEN_P": "0.05",
}


def start_demo_server() -> subprocess.Popen:
    import os
    import sys
    env = {**os.environ, **DEMO_ENV}
    proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--app-dir", str(ROOT / "backend"),
                             "--port", str(DEMO_PORT), "--log-level", "warning"], env=env)
    atexit.register(proc.terminate)  # also on errors mid-recording
    for _ in range(60):
        try:
            urllib.request.urlopen(f"http://localhost:{DEMO_PORT}/api/health", timeout=2)
            return proc
        except OSError:
            time.sleep(0.5)
    proc.terminate()
    raise RuntimeError("demo server did not start")


def write_srt(subs: list[tuple[float, str]], total: float, path: Path):
    def ts(t: float) -> str:
        ms = int(t * 1000)
        return f"{ms // 3_600_000:02d}:{ms // 60_000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"
    lines = []
    for i, (start, text) in enumerate(subs):
        end = subs[i + 1][0] if i + 1 < len(subs) else total
        lines += [str(i + 1), f"{ts(start)} --> {ts(end)}", text, ""]
    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=None, help="use an already running server instead of starting one")
    ap.add_argument("--deploy-url", default=None)
    args = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    server = None
    if args.base is None:
        args.base = f"http://localhost:{DEMO_PORT}"
        server = start_demo_server()
    raw_dir = OUT / "_raw"
    shutil.rmtree(raw_dir, ignore_errors=True)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": W, "height": H}, record_video_dir=str(raw_dir),
                                  record_video_size={"width": W, "height": H}, locale="fa-IR",
                                  timezone_id="Asia/Tehran")
        ctx.add_init_script("try { localStorage.setItem('pj.filters', '{}') } catch (e) {}")
        page = ctx.new_page()
        page.route(f"{args.base}/__stage", lambda r: r.fulfill(body=stage_html(), content_type="text/html; charset=utf-8"))
        page.route(f"{args.base}/__font-ar.woff2", lambda r: r.fulfill(path=str(FONT), content_type="font/woff2"))
        page.route(f"{args.base}/__font-la.woff2", lambda r: r.fulfill(path=str(FONT_LATIN), content_type="font/woff2"))
        with sqlite3.connect(ROOT / "data/state.db") as c:  # clear claims left by interrupted runs
            c.execute("DELETE FROM claimed_shops")
        page.goto(f"{args.base}/__stage")
        page.evaluate("u => document.getElementById('app').src = u", f"{args.base}/")
        page.wait_for_timeout(1500)
        d = Demo(page, args.base)
        try:
            scenario(d, args.base, args.deploy_url)
        finally:
            total = time.time() - d.t0
            video = page.video.path()
            ctx.close()
            browser.close()

    if server:
        server.terminate()
    webm = Path(video)
    mp4 = OUT / "pasajyar-demo.mp4"
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error", "-i", str(webm),
                    "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
                    "-movflags", "+faststart", str(mp4)], check=True)
    write_srt(d.subs, total, OUT / "pasajyar-demo.srt")
    shutil.rmtree(raw_dir, ignore_errors=True)
    print(f"done: {mp4} ({mp4.stat().st_size / 1e6:.1f} MB, {total:.0f}s)")


if __name__ == "__main__":
    main()

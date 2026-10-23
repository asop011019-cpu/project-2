"""Browser checks against the real API and a separate, explicit fixture API.

Requires Python Playwright + Chromium. Start both servers as described in README.
Fixtures are never exposed through the normal application or used as a fallback.
"""
import argparse
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser()
parser.add_argument("--app-url", default="http://localhost:5173")
parser.add_argument("--fixture-url", default="http://localhost:5174")
parser.add_argument("--output-dir", default="/tmp/project2-ui-checks")
args = parser.parse_args()
output = Path(args.output_dir)
output.mkdir(parents=True, exist_ok=True)
passed = []
browser_errors = []

def record(name):
    passed.append(name)
    print("PASS", name, flush=True)

def state(page):
    return page.evaluate("fetch('/api/onboarding/session', {credentials:'include'}).then(r => r.json())")

def choose(page, category="남성복"):
    page.get_by_role("button", name=category, exact=False).click()
    expect(page.locator(".genre-heading h1")).to_be_visible()

def go_genre(page, name):
    page.locator(".genre-nav").get_by_role("button", name=re.compile(name)).click()
    expect(page.locator(".genre-heading h1")).to_have_text(name)

def ready(page):
    expect(page.locator("#style-men_classic .heart-button").first).to_be_visible()

def assert_layout(page, width):
    page.set_viewport_size({"width": width, "height": 900})
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth"), f"overflow at {width}"
    assert not page.locator("main").evaluate("e => e.scrollWidth > e.clientWidth"), f"main overflow at {width}"
    areas = page.evaluate("""() => ({
        main: document.querySelector('main').getBoundingClientRect().bottom,
        footer: document.querySelector('.explore-footer').getBoundingClientRect().top,
        fit: document.querySelector('.photo-expand img') && getComputedStyle(document.querySelector('.photo-expand img')).objectFit
    })""")
    assert areas["main"] <= areas["footer"] + 1, (width, areas)
    if areas["fit"]:
        assert areas["fit"] == "contain"

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
    try:
        # Normal app: published content is genuinely absent.
        real = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = real.new_page()
        page.on("pageerror", lambda error: browser_errors.append(str(error)))
        page.goto(args.app_url)
        expect(page.get_by_role("button", name="남성복")).to_be_visible()
        page.screenshot(path=str(output / "category-desktop.png"))
        page.set_viewport_size({"width": 390, "height": 844})
        page.screenshot(path=str(output / "category-mobile.png"))
        page.set_viewport_size({"width": 1440, "height": 1000})
        choose(page)
        expect(page.locator(".genre-heading h1")).to_have_text("포멀")
        assert state(page)["contentStatus"] == "not_ready"
        assert page.locator(".photo-card").count() == 0
        assert page.locator(".genre-nav button").count() == 5
        assert page.locator(".draft-section").count() == 3
        assert page.locator(".style-responses").count() == 0
        for width in [320, 390, 768, 1440, 1920]:
            assert_layout(page, width)
        page.set_viewport_size({"width": 1440, "height": 1000})
        page.screenshot(path=str(output / "formal-desktop.png"))
        page.set_viewport_size({"width": 390, "height": 844})
        page.screenshot(path=str(output / "formal-mobile.png"))
        page.reload()
        expect(page.locator(".genre-heading h1")).to_have_text("포멀")
        page.set_viewport_size({"width": 1440, "height": 1000})
        go_genre(page, "스트릿")
        page.get_by_role("button", name="선택 확인", exact=True).click()
        expect(page.get_by_role("button", name="온보딩 완료", exact=True)).to_be_disabled()
        page.screenshot(path=str(output / "review-not-ready.png"))
        record("real API: not_ready, no fabricated photos or responses, completion blocked")
        record("320/390/768/1440/1920px: no horizontal overflow; footer outside photo viewport")
        record("real API: category and server genre position survive refresh")
        real.close()

        # Explicit test fixture: server-backed writes, never mocked success.
        fixture = browser.new_context(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
        page = fixture.new_page()
        page.on("pageerror", lambda error: browser_errors.append(str(error)))
        page.goto(args.fixture_url)
        choose(page)
        ready(page)
        assert state(page)["progress"]["totalCount"] == 3
        first = page.locator("#style-men_classic")
        heart = first.locator(".heart-button").first
        before = state(page)
        heart.click()
        expect(heart).to_have_attribute("aria-pressed", "true")
        expect(page.get_by_role("button", name="다음 장르", exact=True)).to_be_enabled()
        after = state(page)
        assert after["currentStyleId"] == before["currentStyleId"]
        assert after["responses"] == before["responses"]
        assert len(after["imagePreferences"]) == 1
        image_id = after["imagePreferences"][0]["imageId"]
        page.evaluate("""async id => {
            for (let i=0; i<2; i++) {
                const r=await fetch(`/api/onboarding/session/styles/men_classic/images/${id}/preference`, {
                    method:'PUT', credentials:'include',
                    headers:{'Content-Type':'application/json','X-Onboarding-Request':'1'},
                    body:JSON.stringify({selected:true})
                }); if(!r.ok) throw Error('Preference write failed');
            }
        }""", image_id)
        assert len(state(page)["imagePreferences"]) == 1
        record("photo hearts independent of style response/location; repeated selected=true is idempotent")

        # Photo saves coalesce to the last intent, including clicks while a request is pending.
        pattern = "**/api/onboarding/session/styles/men_classic/images/*/preference"
        delayed_requests = []
        def delayed(route):
            response = route.fetch()
            page.wait_for_timeout(180)
            delayed_requests.append(route.request.post_data_json["selected"])
            route.fulfill(response=response)
        page.route(pattern, delayed)
        heart.click()  # false
        heart.click()  # true while first save is pending
        expect(heart).to_have_attribute("aria-pressed", "true")
        expect(page.get_by_role("button", name="다음 장르", exact=True)).to_be_enabled()
        assert state(page)["imagePreferences"][0]["selected"] is True
        assert delayed_requests == [False, True]
        page.unroute(pattern)
        assert all(row["response"] is None for row in state(page)["responses"])
        assert page.locator(".style-responses").count() == 0
        record("rapid heart clicks persist the final intent; navigation waits; no inferred style responses")

        # Failed photo writes remain visible as unsaved, block movement, and retry explicitly.
        page.route(pattern, lambda route: route.fulfill(status=500, content_type="application/json", body=json.dumps({"error":{"code":"INTERNAL_ERROR","message":"검증용 사진 저장 실패"}})))
        heart.click()
        expect(page.get_by_role("alert")).to_contain_text("검증용 사진 저장 실패")
        expect(page.get_by_role("button", name="다음 장르", exact=True)).to_be_disabled()
        assert state(page)["imagePreferences"][0]["selected"] is True
        expect(heart).to_have_attribute("aria-pressed", "false")
        page.unroute(pattern)
        page.get_by_role("alert").get_by_role("button", name="다시 시도", exact=True).click()
        expect(page.get_by_role("button", name="다음 장르", exact=True)).to_be_enabled()
        assert state(page)["imagePreferences"][0]["selected"] is False
        heart.click()
        expect(page.get_by_role("button", name="다음 장르", exact=True)).to_be_enabled()
        record("photo failure retains unsaved intent, blocks navigation and safely retries")

        zoom = first.locator(".photo-expand").first
        zoom.scroll_into_view_if_needed()
        scroll = page.locator("main").evaluate("e => e.scrollTop")
        zoom.click()
        expect(page.get_by_role("dialog")).to_be_visible()
        expect(page.locator("#photo-dialog-title")).to_contain_text("클래식 테일러드")
        assert page.locator(".dialog-image img").get_attribute("src").startswith("/media/")
        page.keyboard.press("Escape")
        expect(page.get_by_role("dialog")).not_to_be_visible()
        assert page.evaluate("document.activeElement?.classList.contains('photo-expand')")
        assert abs(page.locator("main").evaluate("e => e.scrollTop") - scroll) <= 2
        expect(heart).to_have_attribute("aria-pressed", "true")
        # Keyboard heart activation is separate from enlargement.
        heart.focus(); page.keyboard.press("Enter")
        expect(page.get_by_role("dialog")).not_to_be_visible()
        expect(page.get_by_role("button", name="다음 장르", exact=True)).to_be_enabled()
        heart.click()
        expect(page.get_by_role("button", name="다음 장르", exact=True)).to_be_enabled()
        record("zoom names substyle; Escape restores focus/scroll; keyboard heart is independent")

        # Genre save and movement commit together. Failure stays on the current genre.
        visit_pattern = "**/api/onboarding/session/genres/men_formal_group/progress"
        page.route(visit_pattern, lambda route: route.fulfill(status=500, content_type="application/json", body=json.dumps({"error":{"code":"INTERNAL_ERROR","message":"검증용 장르 저장 실패"}})))
        page.get_by_role("button", name="다음 장르", exact=True).click()
        expect(page.get_by_role("alert")).to_contain_text("검증용 장르 저장 실패")
        expect(page.locator(".genre-heading h1")).to_have_text("포멀")
        assert state(page)["photoExploration"]["genres"][0]["status"] == "unseen"
        page.unroute(visit_pattern)
        page.get_by_role("alert").get_by_role("button", name="다시 시도", exact=True).click()
        expect(page.locator(".genre-heading h1")).to_have_text("아메리칸")
        assert state(page)["photoExploration"]["genres"][0]["status"] == "viewed"
        page.reload()
        expect(page.locator(".genre-heading h1")).to_have_text("아메리칸")
        # Also restore from a clean URL, proving server position is authoritative.
        page.goto(args.fixture_url)
        expect(page.locator(".genre-heading h1")).to_have_text("아메리칸")
        page.get_by_role("button", name="이전 장르", exact=True).click()
        ready(page)
        expect(page.locator("#style-men_classic .heart-button").first).to_have_attribute("aria-pressed", "true")
        assert page.evaluate("Object.keys(localStorage).length + Object.keys(sessionStorage).length") == 0
        record("genre save failure/retry is atomic; previous and clean-URL refresh restore server progress")

        page.locator(".category-pill").click()
        choose(page, "여성복")
        expect(page.locator(".genre-heading h1")).to_have_text("클래식·시크")
        expect(page.locator("#style-women_classic_tailored .heart-button").first).to_be_visible()
        women = state(page)
        assert women["selectedCategoryId"] == "womenswear"
        assert women["imagePreferences"] == []
        assert all(row["response"] is None for row in women["responses"])
        assert [g["name"] for g in page.evaluate("fetch('/api/onboarding/catalog?categoryId=womenswear').then(r=>r.json()).then(v=>v.genreGroups)")] == ["클래식·시크","아메리칸","로맨틱·내추럴","컨템포러리","스트릿"]
        page.locator(".category-pill").click(); choose(page); ready(page)
        expect(page.locator("#style-men_classic .heart-button").first).to_have_attribute("aria-pressed", "true")
        assert state(page)["photoExploration"]["genres"][0]["status"] == "viewed"
        record("category change isolates and restores genre visits and hearts; server taxonomy is used")

        for width in [320, 390, 768, 1440, 1920]:
            assert_layout(page, width)
        page.set_viewport_size({"width":1440,"height":1000})
        # Fixtures are visibly labeled in review artifacts; not real outfit content.
        page.locator(".selection-guide span").evaluate("e => e.textContent='검증용 fixture · 실제 패션 사진 아님'")
        page.screenshot(path=str(output / "fixture-formal-desktop.png"))
        page.set_viewport_size({"width":390,"height":844})
        page.screenshot(path=str(output / "fixture-formal-mobile.png"))
        page.set_viewport_size({"width":1440,"height":1000})
        assert page.locator(".photo-expand img").first.evaluate("e => getComputedStyle(e).objectFit") == "contain"
        page.get_by_role("button", name="이 장르 건너뛰기", exact=True).click()
        expect(page.locator(".genre-heading h1")).to_have_text("아메리칸")
        assert state(page)["photoExploration"]["genres"][0]["status"] == "skipped"
        assert state(page)["imagePreferences"][0]["selected"] is True
        # Visit all remaining groups using the real server progression.
        for title in ["아메리칸","유러피안","컨템포러리"]:
            expect(page.locator(".genre-heading h1")).to_have_text(title)
            page.get_by_role("button", name="다음 장르", exact=True).click()
        expect(page.locator(".genre-heading h1")).to_have_text("스트릿")
        page.get_by_role("button", name="선택 확인", exact=True).click()
        expect(page.get_by_role("button", name="온보딩 완료", exact=True)).to_be_enabled()
        assert page.locator(".summary-photos .photo-card").count() == 1
        expect(page.locator(".example-label")).to_contain_text("포멀")
        expect(page.locator(".example-label")).to_contain_text("클래식 테일러드")
        assert all(row["response"] is None for row in state(page)["responses"])
        page.get_by_role("button", name="온보딩 완료", exact=True).click()
        expect(page.locator(".complete-screen")).to_be_visible()
        completed = state(page)
        assert completed["status"] == "completed"
        page.evaluate("fetch('/api/onboarding/session/complete',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-Onboarding-Request':'1'},body:'{}'}).then(r=>r.json())")
        assert state(page)["completedAt"] == completed["completedAt"]
        page.reload()
        expect(page.locator(".complete-screen")).to_be_visible()
        page.get_by_role("button", name="취향 수정하기").click(); ready(page)
        assert state(page)["status"] == "completed"
        page.locator("#style-men_classic .heart-button").first.click()
        expect(page.get_by_role("button", name="다음 장르", exact=True)).to_be_enabled()
        assert state(page)["status"] == "in_progress"
        assert state(page)["completedAt"] is None
        record("next=viewed/skip=skipped preserves hearts; review labels images; completion/editing is consistent")
        fixture.close()

        zero = browser.new_context(viewport={"width":1440,"height":1000})
        page = zero.new_page()
        page.goto(args.fixture_url); choose(page); ready(page)
        for _ in range(5):
            page.get_by_role("button", name="이 장르 건너뛰기", exact=True).click()
        expect(page.get_by_role("button", name="온보딩 완료", exact=True)).to_be_enabled()
        assert state(page)["imagePreferences"] == []
        assert all(row["response"] is None for row in state(page)["responses"])
        page.get_by_role("button", name="온보딩 완료", exact=True).click()
        expect(page.locator(".complete-screen")).to_be_visible()
        page.locator(".complete-note").evaluate("e => e.prepend('검증용 fixture · 실제 콘텐츠 아님. ')")
        page.screenshot(path=str(output / "completion-fixture-only.png"))
        record("zero selected photos can complete after explicit genre skips without style responses")
        zero.close()

        # An initial API failure must not become a fabricated demo success.
        network = browser.new_context()
        page = network.new_page()
        network_pattern = "**/api/onboarding/catalog"
        page.route(network_pattern, lambda route: route.fulfill(status=500, content_type="application/json", body=json.dumps({"error":{"code":"INTERNAL_ERROR","message":"검증용 조회 실패"}})))
        page.goto(args.fixture_url)
        expect(page.get_by_role("alert")).to_contain_text("검증용 조회 실패")
        assert page.locator(".category-card").count() == 0
        page.unroute(network_pattern)
        page.get_by_role("button", name="다시 연결", exact=True).click()
        expect(page.get_by_role("button", name="남성복")).to_be_visible()
        record("initial API failure shows recovery instead of demo data; reconnect restores real API")
        network.close()

        # Missing image and initial network failure have honest recovery paths.
        failed = browser.new_context(viewport={"width":390,"height":844})
        page = failed.new_page()
        page.route("**/media/fixture_men_classic_0.png", lambda route: route.fulfill(status=404, body="missing"))
        page.goto(args.fixture_url); choose(page); ready(page)
        expect(page.locator("#style-men_classic .photo-failure")).to_be_visible()
        expect(page.locator("#style-men_classic .photo-retry")).to_be_visible()
        assert_layout(page,390)
        record("image failure preserves layout with retry, without a substitute image")
        failed.close()

        auth = browser.new_context()
        auth.add_cookies([{"name":"onboarding_dev","value":"invalid","domain":"localhost","path":"/"}])
        page = auth.new_page()
        deletes = []
        page.on("request", lambda request: deletes.append(request.url) if request.method == "DELETE" else None)
        page.goto(args.fixture_url)
        expect(page.get_by_role("button", name="새로 시작", exact=True)).to_be_visible()
        assert deletes == []
        page.get_by_role("button", name="새로 시작", exact=True).click()
        expect(page.get_by_role("button", name="남성복")).to_be_visible()
        assert len(deletes) == 1
        record("invalid session is not silently reset; explicit recovery uses DELETE then POST")
        auth.close()
        assert browser_errors == [], browser_errors
    finally:
        browser.close()
        (output / "results.json").write_text(json.dumps({"passed":passed,"pageErrors":browser_errors,"limitations":["Actual fashion images are absent; garment texture fidelity cannot be confirmed.","Published-content interactions use an explicitly isolated fixture API, not production content."]},ensure_ascii=False,indent=2)+"\n")
print(f"{len(passed)} scenario groups passed. Screenshots and results: {output}")

#!/usr/bin/env python3
"""매수 시그널 점수(v2) 일일 계산기 — 표준 라이브러리만 사용.

데이터: FRED(SP500·VIXCLS·BAMLH0A0HYM2) + CNN Fear&Greed.
출력: signal/score.json (대시보드가 읽음), signal/state.json (푸시 중복 방지).
종료코드 0. 푸시가 필요하면 stdout 마지막 줄에 'PUSH\t제목\t본문\tbadge|nobadge' 를 찍는다.

배점(2022~26 두 구간 교차검증, 만점 14):
  HY OAS ≥ 400bp 3 · HY 반전(60일 고점-50bp) 3 · 고점대비 ≤-8% 2 · 일봉 RSI ≤35 2
  F&G ≤15 2 · 주봉 RSI ≤40 1 · 20일 수익률 ≤-10% 1
구간: 0~3 대기 · 4~7 1차(1/3) · 8+ 2차(1/3) · 1차 후 확인신호 → 3차(1/3)
"""
import csv, io, json, os, sys, time, datetime as dt, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "score.json")
STATE = os.path.join(HERE, "state.json")
# FRED는 브라우저 UA 요청을 봇으로 보고 응답을 끊는다(2026-10 확인) → 기본은 단순 UA, CNN만 브라우저 UA
UA = {"User-Agent": "buy-signal/1.0 (python-urllib; github-actions)"}
BROWSER_UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
T1, T2, MAXW = 4, 8, 14


def get(url, headers=None, timeout=25, tries=2):
    req = urllib.request.Request(url, headers={**UA, **(headers or {})})
    for k in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8")
        except Exception as e:
            if k == tries - 1: raise
            print(f"재시도 {k+1}/{tries}: {url.split('?')[0]} ({e})", file=sys.stderr)
            time.sleep(5)


CACHE = os.path.join(HERE, "cache.json")   # 마지막으로 성공한 시계열(최근 ~400거래일). 소스 장애 시 재사용


def fred(series):
    txt = get(f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}")
    if txt.lstrip().startswith("<"):
        raise RuntimeError("FRED 점검 페이지 응답")
    out = {}
    for row in csv.DictReader(io.StringIO(txt)):
        v = list(row.values())[1]
        if v not in ("", "."):
            out[row["observation_date"]] = float(v)
    if not out:
        raise RuntimeError("FRED 빈 응답")
    return out


def yahoo(symbol):
    d = json.loads(get(f"https://query1.finance.yahoo.com/v8/finance/chart/{urllib.request.quote(symbol)}?range=2y&interval=1d", BROWSER_UA))
    r = d["chart"]["result"][0]; ts = r["timestamp"]; cl = r["indicators"]["quote"][0]["close"]
    out = {}
    for t, c in zip(ts, cl):
        if c is not None:
            out[dt.datetime.fromtimestamp(t, dt.timezone(dt.timedelta(hours=-4))).strftime("%Y-%m-%d")] = round(c, 2)
    return out


def cnn_fg():
    txt = get("https://production.dataviz.cnn.io/index/fearandgreed/graphdata/2024-01-01",
              {**BROWSER_UA, "Accept": "application/json", "Referer": "https://www.cnn.com/markets/fear-and-greed", "Origin": "https://www.cnn.com"})
    d = json.loads(txt)
    hist = {dt.datetime.fromtimestamp(p["x"] / 1000, dt.timezone.utc).strftime("%Y-%m-%d"): p["y"] for p in d["fear_and_greed_historical"]["data"]}
    return hist, d["fear_and_greed"]["score"]


def load_series(cache, errors):
    """FRED → (S&P·VIX는 Yahoo 대체) → 캐시 순. 결과를 캐시에 병합해 돌려준다."""
    srcs = {
        "spx": [("FRED SP500", lambda: fred("SP500")), ("Yahoo ^GSPC", lambda: yahoo("^GSPC"))],
        "vix": [("FRED VIXCLS", lambda: fred("VIXCLS")), ("Yahoo ^VIX", lambda: yahoo("^VIX"))],
        "hy": [("FRED BAMLH0A0HYM2", lambda: fred("BAMLH0A0HYM2"))],
        "fg": [("CNN F&G", lambda: cnn_fg()[0])],
    }
    out, stale = {}, []
    for key, cands in srcs.items():
        got = None
        for name, fn in cands:
            try:
                got = fn(); break
            except Exception as e:
                errors.append(f"{name} 실패: {str(e)[:80]}")
        merged = dict(cache.get(key, {}))
        if got: merged.update(got)
        else: stale.append(key)
        keys = sorted(merged)[-420:]
        out[key] = {k: merged[k] for k in keys}
    return out, stale


def rsi(vals, n=14):
    out = [None] * len(vals)
    if len(vals) <= n:
        return out
    g = sum(max(vals[i] - vals[i - 1], 0) for i in range(1, n + 1)) / n
    l = sum(max(vals[i - 1] - vals[i], 0) for i in range(1, n + 1)) / n
    out[n] = 100 - 100 / (1 + g / l) if l else 100
    for i in range(n + 1, len(vals)):
        ch = vals[i] - vals[i - 1]
        g = (g * (n - 1) + max(ch, 0)) / n; l = (l * (n - 1) + max(-ch, 0)) / n
        out[i] = 100 - 100 / (1 + g / l) if l else 100
    return out


def ffill(series, dates):
    keys = sorted(series); out = []; last = None; j = 0
    for d in dates:
        while j < len(keys) and keys[j] <= d:
            last = series[keys[j]]; j += 1
        out.append(last)
    return out


def main():
    errors = []
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    ser, stale = load_series(cache, errors)
    json.dump(ser, open(CACHE, "w"), separators=(",", ":"))
    spx, vix, hy, fg = ser["spx"], ser["vix"], ser["hy"], ser["fg"]
    if not spx:
        raise SystemExit("S&P 500 시계열이 없어 계산 불가")
    try:
        fg_now = cnn_fg()[1]
    except Exception:
        fg_now = None
    dates = sorted(spx); px = [spx[d] for d in dates]
    VIX = ffill(vix, dates); HY = ffill(hy, dates); FG = ffill(fg, dates)
    DRSI = rsi(px)
    # 주봉 RSI: ISO 주 마지막 거래일 종가
    wk = {}
    for d, v in zip(dates, px):
        y, w, _ = dt.date.fromisoformat(d).isocalendar(); wk[(y, w)] = (d, v)
    wkeys = sorted(wk); wr = rsi([wk[k][1] for k in wkeys])
    WRSI = ffill({wk[k][0]: r for k, r in zip(wkeys, wr) if r is not None}, dates)
    run = 0; DD = []
    for p in px:
        run = max(run, p); DD.append(p / run - 1)

    def eval_day(i):
        hy_peak = max(x for x in HY[max(0, i - 59):i + 1] if x is not None) if HY[i] is not None else None
        ret20 = px[i] / px[i - 20] - 1 if i >= 20 else None
        sig = [
            dict(key="hy", label="하이일드 스프레드", cond="400bp 이상", w=3, value=HY[i] * 100 if HY[i] is not None else None, unit="bp",
                 on=HY[i] is not None and HY[i] >= 4.0, gap=(400 - HY[i] * 100) if HY[i] is not None else None),
            dict(key="hy_turn", label="하이일드 스프레드 반전", cond="60일 고점에서 50bp 축소", w=3,
                 value=(hy_peak - HY[i]) * 100 if HY[i] is not None else None, unit="bp 축소",
                 on=HY[i] is not None and hy_peak >= 4.0 and HY[i] <= hy_peak - 0.5, gap=None, confirm=True),
            dict(key="dd", label="고점 대비 하락", cond="-8% 이하", w=2, value=DD[i] * 100, unit="%", on=DD[i] <= -0.08, gap=(DD[i] * 100 + 8)),
            dict(key="drsi", label="일봉 RSI(14)", cond="35 이하", w=2, value=DRSI[i], unit="", on=DRSI[i] is not None and DRSI[i] <= 35, gap=(DRSI[i] - 35) if DRSI[i] else None),
            dict(key="fg", label="공포·탐욕 지수", cond="15 이하", w=2, value=FG[i], unit="", on=FG[i] is not None and FG[i] <= 15, gap=(FG[i] - 15) if FG[i] is not None else None),
            dict(key="wrsi", label="주봉 RSI(14)", cond="40 이하", w=1, value=WRSI[i], unit="", on=WRSI[i] is not None and WRSI[i] <= 40, gap=(WRSI[i] - 40) if WRSI[i] else None),
            dict(key="ret20", label="20일 수익률", cond="-10% 이하", w=1, value=ret20 * 100 if ret20 is not None else None, unit="%", on=ret20 is not None and ret20 <= -0.10, gap=(ret20 * 100 + 10) if ret20 is not None else None),
        ]
        # VIX 30 복귀(확인 신호, 점수 0 — 3차 매수 트리거용)
        vix_cross = False
        if VIX[i] is not None and VIX[i] <= 30:
            for j in range(max(0, i - 10), i):
                if VIX[j] is not None and VIX[j] > 30:
                    vix_cross = True; break
        score = sum(s["w"] for s in sig if s["on"])
        return sig, score, vix_cross

    n = len(dates); i = n - 1
    sig, score, vix_cross = eval_day(i)
    tier = 0 if score < T1 else 1 if score < T2 else 2
    confirm = vix_cross or any(s["on"] for s in sig if s.get("confirm"))
    hist = []   # 최근 1년(≈260거래일) 지표별 추이 — 대시보드 모달 차트용
    r1 = lambda v: round(v, 1) if v is not None else None
    for j in range(max(0, n - 262), n):
        s_, sc_, _ = eval_day(j)
        val = {x["key"]: x["value"] for x in s_}
        hist.append(dict(date=dates[j], px=round(px[j], 2), score=sc_, hy=r1(val["hy"]), hy_turn=r1(val["hy_turn"]), dd=r1(val["dd"]),
                         drsi=r1(val["drsi"]), fg=r1(val["fg"]), wrsi=r1(val["wrsi"]), ret20=r1(val["ret20"])))
    for s in sig:
        for k in ("value", "gap"):
            if s[k] is not None: s[k] = round(s[k], 1)
    out = dict(
        version="v2", generated=dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).strftime("%Y-%m-%d %H:%M KST"),
        asof=dates[i], px=round(px[i], 2), dd=round(DD[i] * 100, 2), vix=VIX[i], hy_bp=round(HY[i] * 100) if HY[i] is not None else None,
        fg=round(FG[i], 1) if FG[i] is not None else None, fg_live=round(fg_now, 1) if fg_now is not None else None,
        score=score, max=MAXW, t1=T1, t2=T2, tier=tier, confirm=confirm, vix_cross=vix_cross,
        signals=sig, history=hist, stale=stale, errors=errors)
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)

    # 푸시: 매일 재산정 결과를 점수와 함께 보낸다. 구간 상승·확인 신호 신규 점등은 제목에서 강조
    st = json.load(open(STATE)) if os.path.exists(STATE) else {}
    prev_tier, prev_conf, prev_score = st.get("tier", 0), st.get("confirm", False), st.get("score")
    on_names = " · ".join(f"{s['label']} {s['value']}{s['unit']}" for s in sig if s["on"])
    tier_name = ["관망", "1차 매수 구간", "2차 매수 구간"][tier]
    if prev_score is None or prev_score == score:
        delta = "직전과 같음"
    else:
        delta = f"직전 {prev_score}점 {'▲' if score > prev_score else '▼'}{abs(score - prev_score)}"
    # 평소 알림은 아이콘 뱃지를 올리지 않는다(PUSH 4번째 칸 nobadge → sw.js가 뱃지 생략)
    badge = "badge"
    if tier > prev_tier:
        title = f"🎯 매수 시그널 {score}/{MAXW}점 — {'1차' if tier == 1 else '2차'} 매수 구간 진입"
    elif tier >= 1 and confirm and not prev_conf:
        title = f"✅ 바닥 확인 신호 — 3차 매수 검토 ({score}/{MAXW}점)"
    else:
        title = f"🎯 매수 시그널 {score}/{MAXW}점 · {tier_name}"
        badge = "nobadge"
    body = f"{dates[i][5:].replace('-', '/')} 종가 기준 · {delta} · 1차 {T1}점 / 2차 {T2}점" + (f" · 켜진 신호: {on_names}" if on_names else "")
    push = (title, body, badge)
    json.dump(dict(tier=tier, confirm=confirm, score=score, asof=dates[i]), open(STATE, "w"))
    print(f"{dates[i]} S&P {px[i]:.0f} DD {DD[i]*100:.1f}% F&G {FG[i]} VIX {VIX[i]} HY {out['hy_bp']}bp → 점수 {score}/{MAXW} (구간 {tier}, 확인 {confirm})")
    for e in errors: print("WARN", e, file=sys.stderr)
    if push:
        print("PUSH\t" + "\t".join(push))


if __name__ == "__main__":
    main()

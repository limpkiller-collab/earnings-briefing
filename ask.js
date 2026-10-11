/*
 * 마켓브리핑 — 보고서 질문하기 (ask.js v1, 2026-10-11)
 * 보고서 HTML에 <script src="../ask.js" defer></script> 한 줄로 붙는다.
 * 서버: 마켓브리핑 Ask GAS 웹앱 (API 키는 GAS에만 있음 — 이 파일에는 비밀값 없음)
 * ASK_URL이 비어 있으면 데모 모드(비밀번호 000000, 가짜 답변)로 동작한다.
 */
(function () {
  'use strict';

  const ASK_URL = 'https://script.google.com/macros/s/AKfycbxMhbpg7WE_mWyafJXAa6FtAhAT28Ifb-J0qqlG7jDQpGhsGxdLxqk-NgnhzNr_XPwy/exec'; // GAS 웹앱 배포 URL
  const DEMO = !ASK_URL;
  const PIN_LEN = 6;
  const Q_MAX = 500;
  const TOKEN_KEY = 'mb_ask_token';

  const PATH_RE = /(실적브리핑|경제지표|급등락|위클리리뷰)\/[^\/]+\.html$/;
  const m = decodeURIComponent(location.pathname).match(PATH_RE);
  if (!m) return;
  const PATH = m[0];
  const KIND = m[1];
  const HIST_KEY = 'mb_ask_hist_' + PATH;

  const FALLBACK_Q = {
    '실적브리핑': ['가이던스는 컨센서스보다 어땠어?', '이번 분기 가장 큰 리스크는?', '다음 분기에 뭘 봐야 해?'],
    '경제지표': ['예상과 다르게 나온 이유는?', '금리 전망엔 어떤 영향이야?', '보유 종목 중 영향 큰 건?'],
    '급등락': ['주원인을 한 줄로 정리해줘', '일시적일까 구조적일까?', '비슷한 과거 사례가 있어?'],
    '위클리리뷰': ['이번 주 핵심 3가지는?', '다음 주 가장 중요한 일정은?', '지난주 관전 포인트 결과는?'],
  };

  /* ───────── storage (사파리 개인정보 모드 등에서 throw 가능) ───────── */
  const store = {
    get(s, k) { try { return s.getItem(k); } catch (e) { return null; } },
    set(s, k, v) { try { s.setItem(k, v); } catch (e) {} },
    del(s, k) { try { s.removeItem(k); } catch (e) {} },
  };
  const getToken = () => store.get(localStorage, TOKEN_KEY);
  const loadHist = () => { try { return JSON.parse(store.get(sessionStorage, HIST_KEY) || '[]'); } catch (e) { return []; } };
  const saveHist = h => store.set(sessionStorage, HIST_KEY, JSON.stringify(h));

  /* ───────── 서버 호출 ───────── */
  async function api(action, extra, token) {
    if (DEMO) return demoApi(action, extra, token);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90000);
    try {
      // text/plain → CORS preflight 없이 GAS doPost로 전달
      const r = await fetch(ASK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action, token: token || getToken() }, extra)),
        signal: ctrl.signal,
      });
      return await r.json();
    } catch (e) {
      return { ok: false, code: 'network', message: e.name === 'AbortError' ? '응답이 너무 늦어요. 다시 시도해 주세요.' : '네트워크 연결을 확인해 주세요.' };
    } finally {
      clearTimeout(timer);
    }
  }

  function demoApi(action, extra, token) {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const t = token || getToken();
    return wait(action === 'ask' ? 1400 : 500).then(() => {
      if (t !== '000000') return { ok: false, code: 'auth', message: '비밀번호가 맞지 않아요.' };
      if (action === 'status') return { ok: true, spentMonth: 1.2345, monthCap: 80 };
      if (action === 'suggest') return { ok: true, questions: FALLBACK_Q[KIND] };
      return {
        ok: true, spentMonth: 1.31, monthCap: 80,
        answer: '데모 답변이에요. **보고서 ① 실적 해석** 기준으로 정리하면,\n- 첫 번째 근거\n- 두 번째 근거\n실제 답변은 GAS 연결 후 Claude가 보고서를 읽고 작성해요.',
      };
    });
  }

  /* ───────── DOM ───────── */
  const host = document.createElement('div');
  host.id = 'mb-ask';
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `
<style>
:host{all:initial;font-family:'Pretendard','Apple SD Gothic Neo',-apple-system,BlinkMacSystemFont,sans-serif;
  --blue:#3182F6;--blue-press:#1B64DA;--blue-bg:#E8F3FF;--red:#F04452;
  --g900:#191F28;--g700:#333D4B;--g600:#4E5968;--g500:#6B7684;--g400:#8B95A1;--g300:#B0B8C1;--g200:#E5E8EB;--g100:#F2F4F6;--g50:#F9FAFB;
  --surface:#fff;--dim:rgba(25,31,40,.45);--shadow:0 6px 20px rgba(0,0,0,.14)}
@media (prefers-color-scheme: dark){
  :host{--blue:#4593FC;--blue-press:#2F7DF0;--blue-bg:#1B2A44;--red:#F6606C;
    --g900:#F2F4F6;--g700:#D5DAE0;--g600:#B0B8C1;--g500:#8B95A1;--g400:#6B7684;--g300:#4E5968;--g200:#333A44;--g100:#262B33;--g50:#1E2228;
    --surface:#17171C;--dim:rgba(0,0,0,.6);--shadow:0 6px 20px rgba(0,0,0,.5)}
}
*{box-sizing:border-box;margin:0;padding:0;font-family:inherit;-webkit-tap-highlight-color:transparent}
button{font-family:inherit;cursor:pointer;border:0;background:none;color:inherit}

.fab{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:2147483000;
  display:flex;align-items:center;gap:6px;background:var(--blue);color:#fff;font-size:15px;font-weight:700;
  letter-spacing:-0.02em;padding:13px 18px;border-radius:999px;box-shadow:var(--shadow);transition:transform .12s,opacity .2s}
.fab:active{transform:scale(.96)}
.fab.hide{opacity:0;pointer-events:none}

.dim{position:fixed;inset:0;background:var(--dim);opacity:0;visibility:hidden;transition:.22s;z-index:2147483001}
.dim.on{opacity:1;visibility:visible}
.sheet{position:fixed;left:0;right:0;bottom:0;z-index:2147483002;background:var(--surface);color:var(--g900);
  border-radius:20px 20px 0 0;max-width:760px;margin:0 auto;height:min(86vh,720px);display:flex;flex-direction:column;
  transform:translateY(101%);transition:transform .26s cubic-bezier(.32,.72,0,1);padding-bottom:env(safe-area-inset-bottom)}
.sheet.on{transform:translateY(0)}
.grab{width:36px;height:4px;border-radius:4px;background:var(--g200);margin:10px auto 6px;flex:none}
.head{display:flex;align-items:center;gap:8px;padding:6px 20px 10px;flex:none}
.title{font-size:18px;font-weight:800;letter-spacing:-0.03em}
.x{margin-left:auto;background:var(--g100);color:var(--g500);width:30px;height:30px;border-radius:50%;font-size:14px;font-weight:700;line-height:1}

/* ── 비밀번호 키패드 ── */
.pin{flex:1;display:flex;flex-direction:column;padding:8px 20px 12px;min-height:0}
.pin-top{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;min-height:150px}
.pin-h{font-size:20px;font-weight:700;letter-spacing:-0.03em;line-height:1.4}
.pin-s{font-size:14px;color:var(--g500);margin-top:6px;line-height:1.5}
.dots{display:flex;gap:16px;margin:28px 0 14px}
.dot{width:14px;height:14px;border-radius:50%;background:var(--g200);transition:background .12s,transform .12s}
.dot.f{background:var(--blue);transform:scale(1.08)}
.pin-msg{min-height:20px;font-size:13.5px;font-weight:600;color:var(--red)}
.pin-msg.info{color:var(--g500);font-weight:500}
.shake{animation:shake .42s}
@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-9px)}40%,80%{transform:translateX(9px)}}
.pad{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;flex:none}
.key{height:60px;border-radius:14px;font-size:26px;font-weight:600;color:var(--g900);display:flex;align-items:center;justify-content:center;
  transition:background .08s;user-select:none;-webkit-user-select:none}
.key:active,.key.press{background:var(--g100)}
.key.fn{font-size:15px;font-weight:600;color:var(--g500)}
.key svg{width:28px;height:28px}
.pad.busy .key{opacity:.35;pointer-events:none}

/* ── 대화 ── */
.chat{flex:1;display:flex;flex-direction:column;min-height:0}
.log{flex:1;overflow-y:auto;padding:4px 20px 12px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.intro{font-size:14px;color:var(--g500);line-height:1.6;margin:4px 0 14px}
.sug-h{font-size:13px;font-weight:700;color:var(--g400);margin:6px 0 8px}
.sugs{display:flex;flex-direction:column;gap:8px;margin-bottom:8px}
.sug{display:flex;align-items:center;gap:10px;text-align:left;background:var(--g50);border:1px solid var(--g200);
  border-radius:14px;padding:13px 14px;font-size:15px;font-weight:600;color:var(--g700);letter-spacing:-0.02em;line-height:1.4}
.sug:active{background:var(--g100)}
.sug i{font-style:normal;color:var(--blue);font-weight:800;flex:none}
.sugs.sm{flex-direction:row;flex-wrap:wrap;margin-top:4px}
.sugs.sm .sug{padding:8px 12px;font-size:13.5px;border-radius:999px}
.sug-skel{height:48px;border-radius:14px;background:linear-gradient(90deg,var(--g100),var(--g50),var(--g100));background-size:200% 100%;animation:sk 1.2s infinite}
@keyframes sk{to{background-position:-200% 0}}
.msg{margin:10px 0;display:flex}
.msg.u{justify-content:flex-end}
.bub{max-width:86%;font-size:15px;line-height:1.65;letter-spacing:-0.01em;word-break:keep-all;overflow-wrap:anywhere}
.u .bub{background:var(--blue);color:#fff;padding:10px 14px;border-radius:18px 18px 4px 18px;white-space:pre-wrap}
.a .bub{background:var(--g100);color:var(--g900);padding:12px 15px;border-radius:18px 18px 18px 4px}
.a .bub p+p,.a .bub p+ul,.a .bub ul+p{margin-top:8px}
.a .bub ul{padding-left:18px}
.a .bub li{margin:2px 0}
.a .bub strong{font-weight:700}
.err .bub{background:none;border:1px solid var(--g200);color:var(--g600);font-size:14px}
.typing{display:inline-flex;gap:4px;padding:4px 0}
.typing span{width:7px;height:7px;border-radius:50%;background:var(--g400);animation:bl 1.2s infinite}
.typing span:nth-child(2){animation-delay:.15s}.typing span:nth-child(3){animation-delay:.3s}
@keyframes bl{0%,80%,100%{opacity:.25}40%{opacity:1}}
.typing-t{font-size:13px;color:var(--g500);margin-left:8px}

.bar{flex:none;border-top:1px solid var(--g100);padding:10px 16px 8px}
.row{display:flex;align-items:flex-end;gap:8px;background:var(--g100);border-radius:22px;padding:6px 6px 6px 16px}
textarea{flex:1;border:0;outline:0;background:none;resize:none;font-family:inherit;font-size:16px;line-height:1.5;color:var(--g900);
  max-height:120px;padding:6px 0}
textarea::placeholder{color:var(--g400)}
.send{width:36px;height:36px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;flex:none}
.send:disabled{background:var(--g300)}
.send svg{width:18px;height:18px}
.foot{display:flex;align-items:center;gap:10px;padding:8px 4px 0;font-size:12px;color:var(--g400)}
.foot button{font-size:12px;font-weight:600;color:var(--g500)}
.foot .sp{margin-left:auto}
.cnt{font-size:12px;color:var(--g400);text-align:right;padding:4px 8px 0}
.cnt.over{color:var(--red)}
</style>
<button class="fab" type="button" aria-label="이 보고서에 질문하기">💬 질문하기</button>
<div class="dim"></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label="이 보고서에 질문하기">
  <div class="grab"></div>
  <div class="head"><div class="title">이 보고서에 질문하기</div><button class="x" type="button" aria-label="닫기">✕</button></div>
  <div class="body" style="flex:1;display:flex;min-height:0"></div>
</div>`;

  const $ = s => root.querySelector(s);
  const fab = $('.fab'), dim = $('.dim'), sheet = $('.sheet'), body = $('.body');
  let view = null;           // 'pin' | 'chat'
  let busy = false;
  let spent = null, cap = 80;
  let suggestions = null;

  /* ───────── 열기 · 닫기 ───────── */
  let prevOverflow = '';
  function open() {
    prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    dim.classList.add('on'); sheet.classList.add('on'); fab.classList.add('hide');
    if (getToken()) showChat(); else showPin();
  }
  function close() {
    document.documentElement.style.overflow = prevOverflow;
    dim.classList.remove('on'); sheet.classList.remove('on'); fab.classList.remove('hide');
    if (document.activeElement) document.activeElement.blur && document.activeElement.blur();
  }
  fab.addEventListener('click', open);
  dim.addEventListener('click', close);
  $('.x').addEventListener('click', close);

  // iOS 키보드가 올라오면 시트를 보이는 영역에 맞춘다
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const fit = () => {
      if (!sheet.classList.contains('on')) return;
      const kb = window.innerHeight - vv.height - vv.offsetTop;
      sheet.style.bottom = Math.max(0, kb) + 'px';
      sheet.style.height = kb > 80 ? Math.round(vv.height * 0.94) + 'px' : '';
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
  }

  /* ───────── 비밀번호 키패드 ───────── */
  const BACK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 5H8.5L2.5 12l6 7H21a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="M17 9.5l-5 5M12 9.5l5 5"/></svg>';

  function showPin(msg) {
    view = 'pin';
    let pin = '';
    body.innerHTML = `
<div class="pin">
  <div class="pin-top">
    <div class="pin-h">비밀번호 6자리를 눌러 주세요</div>
    <div class="pin-s">처음 한 번만 입력하면 이 기기에 저장돼요</div>
    <div class="dots" aria-hidden="true">${'<span class="dot"></span>'.repeat(PIN_LEN)}</div>
    <div class="pin-msg" role="status" aria-live="polite"></div>
  </div>
  <div class="pad" role="group" aria-label="숫자 키패드">
    ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="key" type="button" data-k="${n}">${n}</button>`).join('')}
    <button class="key fn" type="button" data-k="clear">전체삭제</button>
    <button class="key" type="button" data-k="0">0</button>
    <button class="key fn" type="button" data-k="back" aria-label="지우기">${BACK_SVG}</button>
  </div>
</div>`;
    const dots = [...body.querySelectorAll('.dot')];
    const dotsWrap = body.querySelector('.dots');
    const msgEl = body.querySelector('.pin-msg');
    const pad = body.querySelector('.pad');
    const setMsg = (t, info) => { msgEl.textContent = t || ''; msgEl.classList.toggle('info', !!info); };
    const paint = () => dots.forEach((d, i) => d.classList.toggle('f', i < pin.length));
    if (msg) setMsg(msg);

    async function submit() {
      pad.classList.add('busy');
      setMsg('확인하고 있어요…', true);
      const r = await api('status', {}, pin);
      if (view !== 'pin') return;
      pad.classList.remove('busy');
      if (r.ok) {
        store.set(localStorage, TOKEN_KEY, pin);
        if (typeof r.spentMonth === 'number') { spent = r.spentMonth; cap = r.monthCap || cap; }
        showChat();
        return;
      }
      pin = ''; paint();
      dotsWrap.classList.remove('shake'); void dotsWrap.offsetWidth; dotsWrap.classList.add('shake');
      if (r.code === 'locked') pad.classList.add('busy');
      setMsg(r.message || '확인하지 못했어요. 다시 시도해 주세요.');
    }

    function press(k) {
      if (pad.classList.contains('busy')) return;
      if (k === 'back') pin = pin.slice(0, -1);
      else if (k === 'clear') pin = '';
      else if (/^\d$/.test(k) && pin.length < PIN_LEN) pin += k;
      if (msgEl.textContent && !msgEl.classList.contains('info')) setMsg('');
      paint();
      if (pin.length === PIN_LEN) submit();
    }

    pad.addEventListener('click', e => {
      const b = e.target.closest('.key');
      if (b) press(b.dataset.k);
    });
    // 데스크톱: 실제 키보드 숫자도 받는다
    const onKey = e => {
      if (view !== 'pin' || !sheet.classList.contains('on')) return;
      let k = null;
      if (/^\d$/.test(e.key)) k = e.key;
      else if (e.key === 'Backspace') k = 'back';
      else if (e.key === 'Escape') { close(); return; }
      if (!k) return;
      e.preventDefault();
      const b = pad.querySelector(`[data-k="${k}"]`);
      if (b) { b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 90); }
      press(k);
    };
    document.addEventListener('keydown', onKey);
    showPin.cleanup && showPin.cleanup();
    showPin.cleanup = () => document.removeEventListener('keydown', onKey);
  }

  function resetPin(message) {
    store.del(localStorage, TOKEN_KEY);
    showPin(message);
  }

  /* ───────── 대화 ───────── */
  const SEND_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';

  function showChat() {
    showPin.cleanup && showPin.cleanup();
    view = 'chat';
    body.innerHTML = `
<div class="chat">
  <div class="log" aria-live="polite"></div>
  <div class="bar">
    <div class="row">
      <textarea rows="1" maxlength="${Q_MAX + 50}" placeholder="보고서에 대해 물어보세요" aria-label="질문 입력"></textarea>
      <button class="send" type="button" aria-label="보내기" disabled>${SEND_SVG}</button>
    </div>
    <div class="cnt" hidden></div>
    <div class="foot">
      <button type="button" data-a="new">새 대화</button>
      <button type="button" data-a="pin">비밀번호 다시 입력</button>
      <span class="sp"></span>
    </div>
  </div>
</div>`;
    const log = body.querySelector('.log');
    const ta = body.querySelector('textarea');
    const sendBtn = body.querySelector('.send');
    const cnt = body.querySelector('.cnt');
    const sp = body.querySelector('.sp');

    const paintSpent = () => { sp.textContent = spent == null ? 'AI 답변은 틀릴 수 있어요' : `이번 달 $${spent.toFixed(2)} / $${cap}`; };
    paintSpent();
    if (spent == null) api('status').then(r => {
      if (r.ok) { spent = r.spentMonth; cap = r.monthCap || cap; paintSpent(); }
      else if (r.code === 'auth') resetPin(r.message);
    });

    const scrollEnd = () => { log.scrollTop = log.scrollHeight; };
    const usedQs = () => new Set(loadHist().filter(h => h.role === 'user').map(h => h.text));

    function sugButtons(qs, small) {
      const wrap = document.createElement('div');
      wrap.className = 'sugs' + (small ? ' sm' : '');
      qs.forEach(q => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'sug';
        b.innerHTML = small ? '' : '<i>Q</i>';
        b.appendChild(document.createTextNode(q));
        b.addEventListener('click', () => ask(q));
        wrap.appendChild(b);
      });
      return wrap;
    }

    function render() {
      const hist = loadHist();
      log.innerHTML = '';
      if (!hist.length) {
        const intro = document.createElement('div');
        intro.className = 'intro';
        intro.textContent = '이 보고서 내용을 바탕으로 답해 드려요. 궁금한 걸 직접 물어보거나 아래 질문을 눌러 보세요.';
        log.appendChild(intro);
        const h = document.createElement('div');
        h.className = 'sug-h'; h.textContent = '이런 걸 물어볼 수 있어요';
        log.appendChild(h);
        if (suggestions) log.appendChild(sugButtons(suggestions));
        else {
          const sk = document.createElement('div'); sk.className = 'sugs';
          sk.innerHTML = '<div class="sug-skel"></div>'.repeat(3);
          log.appendChild(sk);
        }
        return;
      }
      hist.forEach(h => log.appendChild(bubble(h.role === 'user' ? 'u' : 'a', h.text)));
      const rest = (suggestions || []).filter(q => !usedQs().has(q));
      if (rest.length && !busy) log.appendChild(sugButtons(rest, true));
      scrollEnd();
    }

    function bubble(who, text, isErr) {
      const row = document.createElement('div');
      row.className = 'msg ' + who + (isErr ? ' err' : '');
      const b = document.createElement('div');
      b.className = 'bub';
      if (who === 'u' || isErr) b.textContent = text;
      else b.innerHTML = md(text);
      row.appendChild(b);
      return row;
    }

    function typing() {
      const row = document.createElement('div');
      row.className = 'msg a';
      row.innerHTML = '<div class="bub"><span class="typing"><span></span><span></span><span></span></span><span class="typing-t">보고서를 읽고 답을 쓰고 있어요</span></div>';
      return row;
    }

    async function ask(q) {
      q = (q || '').trim();
      if (!q || busy || q.length > Q_MAX) return;
      busy = true;
      const hist = loadHist();
      const sendHist = hist.slice();
      hist.push({ role: 'user', text: q });
      saveHist(hist);
      ta.value = ''; autoGrow(); syncSend();
      render();
      const t = typing(); log.appendChild(t); scrollEnd();

      const r = await api('ask', { path: PATH, q, history: sendHist });
      t.remove();
      busy = false;
      if (r.ok) {
        hist.push({ role: 'assistant', text: r.answer });
        saveHist(hist);
        if (typeof r.spentMonth === 'number') { spent = r.spentMonth; cap = r.monthCap || cap; paintSpent(); }
        render();
        return;
      }
      // 실패: 질문을 기록에서 빼고 입력창에 되돌린다 (user/assistant 교대 유지)
      hist.pop(); saveHist(hist);
      if (r.code === 'auth') { resetPin('비밀번호가 바뀌었어요. 다시 입력해 주세요.'); return; }
      render();
      ta.value = q; autoGrow(); syncSend();
      log.appendChild(bubble('a', r.message || '답변을 받지 못했어요.', true));
      scrollEnd();
    }

    function autoGrow() { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }
    function syncSend() {
      const n = ta.value.trim().length;
      sendBtn.disabled = busy || !n || n > Q_MAX;
      cnt.hidden = n < Q_MAX - 100;
      cnt.textContent = `${n} / ${Q_MAX}`;
      cnt.classList.toggle('over', n > Q_MAX);
    }
    ta.addEventListener('input', () => { autoGrow(); syncSend(); });
    ta.addEventListener('keydown', e => {
      // 한글 조합 중 Enter는 무시 (조합 확정용)
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229 && matchMedia('(hover: hover)').matches) {
        e.preventDefault(); ask(ta.value);
      }
    });
    sendBtn.addEventListener('click', () => ask(ta.value));
    body.querySelector('.foot').addEventListener('click', e => {
      const a = e.target.closest('button') && e.target.closest('button').dataset.a;
      if (a === 'new') { saveHist([]); render(); }
      if (a === 'pin') resetPin();
    });

    render();
    loadSuggestions().then(() => { if (view === 'chat') render(); });
  }

  /* ───────── 추천 질문: 심어 둔 블록 → GAS → 고정 질문 ───────── */
  async function loadSuggestions() {
    if (suggestions) return;
    const el = document.getElementById('ask-suggest');
    if (el) {
      try {
        const qs = JSON.parse(el.textContent).questions;
        if (Array.isArray(qs) && qs.length >= 3) { suggestions = qs.slice(0, 3); return; }
      } catch (e) {}
    }
    const ck = 'mb_ask_sug_' + PATH;
    const cached = store.get(sessionStorage, ck);
    if (cached) { try { suggestions = JSON.parse(cached); return; } catch (e) {} }
    const r = await api('suggest', { path: PATH });
    if (r.ok && Array.isArray(r.questions) && r.questions.length >= 3) {
      suggestions = r.questions.slice(0, 3);
      store.set(sessionStorage, ck, JSON.stringify(suggestions));
    } else {
      suggestions = FALLBACK_Q[KIND];
    }
  }

  /* ───────── 최소 마크다운: 굵게 · "- " 목록 · 문단 (escape 후 변환) ───────── */
  function md(text) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const out = [];
    let list = null, para = [];
    const flushP = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
    const flushL = () => { if (list) { out.push('<ul>' + list.map(li => '<li>' + inline(li) + '</li>').join('') + '</ul>'); list = null; } };
    String(text).split('\n').forEach(line => {
      const t = line.trim();
      const li = t.match(/^[-•*]\s+(.*)$/);
      if (li) { flushP(); (list = list || []).push(li[1]); }
      else if (!t) { flushP(); flushL(); }
      else { flushL(); para.push(t); }
    });
    flushP(); flushL();
    return out.join('');
  }
})();

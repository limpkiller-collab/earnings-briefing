#!/usr/bin/env node
// 매수 시그널 웹푸시 (GitHub Actions용) — 키·구독정보는 Secrets 환경변수로만 받는다.
// 사용법: node push.js "제목" "본문"
//   env: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, PUSH_SUBSCRIPTIONS(JSON 배열)
const webpush = require('web-push');
const [, , title, body] = process.argv;
const { VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, PUSH_SUBSCRIPTIONS } = process.env;
if (!title || !body) { console.error('사용법: node push.js "제목" "본문"'); process.exit(1); }
if (!VAPID_PUBLIC || !VAPID_PRIVATE || !PUSH_SUBSCRIPTIONS) { console.error('SKIP: 푸시 Secrets 미설정'); process.exit(0); }
webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:noreply@example.com', VAPID_PUBLIC, VAPID_PRIVATE);
let subs = JSON.parse(PUSH_SUBSCRIPTIONS); if (!Array.isArray(subs)) subs = [subs];
const payload = JSON.stringify({ title, body, url: 'https://limpkiller-collab.github.io/earnings-briefing/#signal' });
(async () => {
  let sent = 0;
  for (const sub of subs) {
    try { await webpush.sendNotification(sub, payload); sent++; }
    catch (err) { console.error(`발송 실패 (HTTP ${err.statusCode || '?'}): ${err.message}`); }
  }
  console.log(`푸시 발송 ${sent}/${subs.length}건`);
})();

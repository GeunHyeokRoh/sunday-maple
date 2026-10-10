import { readFile, writeFile } from 'node:fs/promises';

const NEXON_API_KEY = process.env.NEXON_API_KEY;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const STATE_PATH = new URL('../state.json', import.meta.url);

function todayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchNexon(path) {
  const res = await fetch(`https://open.api.nexon.com${path}`, {
    headers: { 'x-nxopen-api-key': NEXON_API_KEY },
  });
  if (!res.ok) {
    throw new Error(`Nexon API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

function extractImageUrls(html) {
  const urls = [];
  const regex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const src = match[1];
    const absolute = src.startsWith('http') ? src : new URL(src, 'https://www.nexon.com').toString();
    if (!urls.includes(absolute)) urls.push(absolute);
  }
  return urls;
}

async function main() {
  const today = todayKST();
  const state = JSON.parse(await readFile(STATE_PATH, 'utf-8'));
  const lastSentDate = state.lastSentDate ?? state.lastSentWeek ?? null;

  if (lastSentDate === today) {
    console.log(`Already sent for ${today}, skipping.`);
    return;
  }

  // 금요일이 휴일이면 목요일 등에 미리 올라오는 경우가 있어서, 오늘 하루가 아니라
  // (마지막 전송일, 오늘] 구간에 등록된 썬데이 메이플 공지를 찾는다.
  // 오래된 공지를 잘못 보내지 않도록 최대 최근 7일까지만 본다.
  const weekAgo = addDays(today, -6);
  const from = lastSentDate && lastSentDate >= weekAgo ? addDays(lastSentDate, 1) : weekAgo;

  // "썬데이 메이플"은 일반 공지(v1/notice)가 아니라 이벤트 공지(v1/notice-event)로 등록된다.
  const { event_notice: events } = await fetchNexon('/maplestory/v1/notice-event');
  const target = events
    .filter((n) => {
      const date = n.date.slice(0, 10);
      return (
        (n.title.includes('썬데이 메이플') || n.title.includes('썬데이메이플')) &&
        date >= from &&
        date <= today &&
        String(n.notice_id) !== String(state.lastNoticeId)
      );
    })
    .sort((a, b) => b.date.localeCompare(a.date))[0];

  if (!target) {
    console.log(`No Sunday Maple event notice between ${from} and ${today} yet.`);
    return;
  }

  const detail = await fetchNexon(`/maplestory/v1/notice-event/detail?notice_id=${target.notice_id}`);
  const imageUrls = extractImageUrls(detail.contents);

  if (imageUrls.length === 0) {
    console.log(`Notice found (${target.title}) but no images in contents.`);
    return;
  }

  const form = new FormData();
  for (const [i, url] of imageUrls.entries()) {
    const imageRes = await fetch(url);
    if (!imageRes.ok) {
      throw new Error(`Image download failed (${url}): ${imageRes.status}`);
    }
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer());
    const pathname = new URL(url).pathname;
    const ext = pathname.includes('.') ? pathname.split('.').pop() : 'jpg';
    form.append(`files[${i}]`, new Blob([imageBuffer]), `sunday_maple_${i}.${ext}`);
  }

  const webhookRes = await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: form });
  if (!webhookRes.ok) {
    throw new Error(`Discord webhook failed: ${webhookRes.status} ${await webhookRes.text()}`);
  }

  await writeFile(STATE_PATH, JSON.stringify({ lastSentDate: today, lastNoticeId: target.notice_id }, null, 2) + '\n');

  console.log(`Sent Sunday Maple notice (posted ${target.date}) on ${today}: ${target.title} (${imageUrls.length} images)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

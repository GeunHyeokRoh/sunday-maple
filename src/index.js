import { readFile, writeFile } from 'node:fs/promises';

const NEXON_API_KEY = process.env.NEXON_API_KEY;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const STATE_PATH = new URL('../state.json', import.meta.url);

function todayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
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

  if (state.lastSentWeek === today) {
    console.log(`Already sent for ${today}, skipping.`);
    return;
  }

  // "썬데이 메이플"은 일반 공지(v1/notice)가 아니라 이벤트 공지(v1/notice-event)로 등록된다.
  const { event_notice: events } = await fetchNexon('/maplestory/v1/notice-event');
  const target = events.find(
    (n) =>
      (n.title.includes('썬데이 메이플') || n.title.includes('썬데이메이플')) &&
      n.date.startsWith(today)
  );

  if (!target) {
    console.log(`No Sunday Maple event notice for ${today} yet.`);
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

  await writeFile(STATE_PATH, JSON.stringify({ lastSentWeek: today }, null, 2) + '\n');

  console.log(`Sent Sunday Maple notice for ${today}: ${target.title} (${imageUrls.length} images)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

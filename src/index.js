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

function extractImageUrl(html) {
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (!match) return null;
  const src = match[1];
  return src.startsWith('http') ? src : new URL(src, 'https://www.nexon.com').toString();
}

async function main() {
  const today = todayKST();
  const state = JSON.parse(await readFile(STATE_PATH, 'utf-8'));

  if (state.lastSentWeek === today) {
    console.log(`Already sent for ${today}, skipping.`);
    return;
  }

  const { notice } = await fetchNexon('/maplestory/v1/notice');
  const target = notice.find(
    (n) =>
      (n.title.includes('썬데이 메이플') || n.title.includes('썬데이메이플')) &&
      n.date.startsWith(today)
  );

  if (!target) {
    console.log(`No Sunday Maple notice for ${today} yet.`);
    return;
  }

  const detail = await fetchNexon(`/maplestory/v1/notice/detail?notice_id=${target.notice_id}`);
  const imageUrl = extractImageUrl(detail.contents);

  if (!imageUrl) {
    console.log(`Notice found (${target.title}) but no image in contents.`);
    return;
  }

  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) {
    throw new Error(`Image download failed: ${imageRes.status}`);
  }
  const imageBuffer = Buffer.from(await imageRes.arrayBuffer());

  const form = new FormData();
  form.append('content', `📅 ${target.title}\n${target.url}`);
  form.append('file', new Blob([imageBuffer]), 'sunday_maple.jpg');

  const webhookRes = await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: form });
  if (!webhookRes.ok) {
    throw new Error(`Discord webhook failed: ${webhookRes.status} ${await webhookRes.text()}`);
  }

  await writeFile(STATE_PATH, JSON.stringify({ lastSentWeek: today }, null, 2) + '\n');

  console.log(`Sent Sunday Maple notice for ${today}: ${target.title}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

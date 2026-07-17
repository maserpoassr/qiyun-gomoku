import { chromium } from 'playwright';
const URL = 'https://5.hfive.ggff.net';
async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => { const t = msg.text(); if(!t.includes('ERR_BLOCKED')&&!t.includes('google')&&!t.includes('cloudflare')&&!t.includes('content_main')) logs.push(t); });
  await page.goto(URL, { waitUntil: 'commit', timeout: 30000 });
  // 等模型下载 + 引擎初始化
  await page.waitForTimeout(45000);
  await page.waitForTimeout(5000);
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
  console.log('点击后天元, 等待 60s...');
  await page.waitForTimeout(60000);
  const stdoutEvents = logs.filter(l => l.includes('stdout') || l.includes('MESSAGE') || l.includes('INFO'));
  console.log('stdout/INFO/MESSAGE 消息:', stdoutEvents.length);
  stdoutEvents.forEach(l => console.log('  [stdout]', l));
  const coords = logs.filter(l => /^\d+,\d+$/.test(l.trim()));
  console.log('坐标输出:', coords.length);
  coords.forEach(l => console.log('  [move]', l));
  const engineLogs = logs.filter(l => l.includes('Engine') || l.includes('[Rapfi]'));
  console.log('引擎日志:', engineLogs.length);
  engineLogs.slice(-20).forEach(l => console.log('  ', l));
  console.log('\n总日志:', logs.length);
  logs.slice(-30).forEach(l => console.log(l));
  await browser.close();
}
test().catch(e => { console.error('失败:', e); process.exit(1); });

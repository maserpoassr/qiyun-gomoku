import { chromium } from 'playwright';

const URL = 'https://5.hfive.ggff.net';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const logs = [];
  page.on('console', (msg) => {
    const t = msg.text();
    if (!t.includes('ERR_BLOCKED') && !t.includes('google') && !t.includes('cloudflare') && !t.includes('content_main'))
      logs.push(`[${msg.type()}] ${t}`);
  });

  // 1) 加载
  console.log('1) 加载页面...');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  console.log('   标题:', await page.title());

  // 2) 等待 AI 就绪
  console.log('2) 等待 AI 就绪...');
  await page.waitForFunction(
    () => document.querySelector('.engine-badge')?.textContent.includes('AI 就绪'),
    { timeout: 40000 }
  );
  console.log('   ✅ AI 就绪');

  // 3) 等待 5 秒让模型完全下载
  console.log('3) 等待模型加载...');
  await page.waitForTimeout(5000);

  // 4) 截屏落子前
  await page.screenshot({ path: '/tmp/before.png' });

  // 5) 落子天元
  const canvas = await page.$('canvas');
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  console.log('4) 落子天元...');
  await page.mouse.click(cx, cy);
  
  // 6) 等 30 秒让 AI 计算
  console.log('5) 等待 AI 计算（30s）...');
  await page.waitForTimeout(30000);
  
  // 7) 截屏落子后
  await page.screenshot({ path: '/tmp/after.png' });
  
  // 8) 分析日志
  console.log('\n=== 关键日志分析 ===');
  const stdoutLines = logs.filter(l => l.includes('stdout'));
  console.log(`stdout 消息数: ${stdoutLines.length}`);
  stdoutLines.forEach(l => console.log(`  ${l}`));
  
  const coordLines = logs.filter(l => /\d+,\d+/.test(l));
  console.log(`坐标输出数: ${coordLines.length}`);
  coordLines.forEach(l => console.log(`  ${l}`));
  
  const engineMsgs = logs.filter(l => l.includes('MESSAGE') || l.includes('INFO'));
  console.log(`引擎消息数: ${engineMsgs.length}`);
  engineMsgs.slice(-10).forEach(l => console.log(`  ${l}`));

  console.log('\n=== 所有日志 ===');
  logs.forEach(l => console.log(l));

  await browser.close();
}

test().catch(e => { console.error('失败:', e); process.exit(1); });

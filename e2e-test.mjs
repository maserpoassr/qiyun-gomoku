import { chromium } from 'playwright';

const URL = 'https://5.hfive.ggff.net';
const SITE = 'https://5.hfive.ggff.net';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const logs = [];
  page.on('console', (msg) => {
    const t = msg.text();
    if (!t.includes('ERR_BLOCKED') && !t.includes('google') && !t.includes('cloudflare'))
      logs.push(`[${msg.type()}] ${t}`);
  });

  // 1) 加载
  console.log('1) 加载页面...');
  await page.goto(SITE, { waitUntil: 'networkidle', timeout: 30000 });
  console.log('   标题:', await page.title());

  // 2) 等待 AI 就绪
  console.log('2) 等待 AI 就绪...');
  try {
    await page.waitForFunction(
      () => document.querySelector('.engine-badge')?.textContent.includes('AI 就绪'),
      { timeout: 40000 }
    );
    console.log('   ✅ AI 就绪');
  } catch {
    console.log('   ❌ 超时');
    await browser.close();
    return;
  }

  // 3) 检查 Canvas
  const canvas = await page.$('canvas');
  if (!canvas) { console.log('❌ 无 Canvas'); await browser.close(); return; }
  console.log('   ✅ Canvas 存在');

  // 4) 截屏（落子前）
  await page.screenshot({ path: '/tmp/before.png' });

  // 5) 点击棋盘中央落子（大约 7,7 天元位置）
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  console.log('3) 在天元落子...');
  await page.mouse.click(cx, cy);
  console.log('   等待 AI 回应（15s）...');

  // 6) 等 AI 落子（看有没有新日志）
  await page.waitForTimeout(5000);
  
  // 检查日志中是否有 engine 输出
  const aiLogs = logs.filter(l => l.includes('Engine') || l.includes('rapfi') || l.includes('Rapfi'));
  console.log(`   Engine 日志: ${aiLogs.length > 0 ? '✅' : '⚠️ 无'}`);
  aiLogs.forEach(l => console.log(`     ${l}`));

  // 7) 再等一会儿并再次截屏
  await page.waitForTimeout(10000);
  await page.screenshot({ path: '/tmp/after.png' });

  // 8) 检查是否有 AI 思考相关的日志
  const allLogs = logs.join('\n');
  const hasMove = allLogs.includes('stdout') || allLogs.includes('YXSTOP') || allLogs.includes('bestmove');
  console.log(`4) AI 输出检测: ${hasMove ? '✅' : '⚠️ 可能还在思考'}`);

  // 9) 检查两帧截图差异（简单对比：在天元位置取像素）
  // 实在无法检测 Canvas 内容变化，但可以通过判断是否有错误日志
  const errorLogs = logs.filter(l => l.includes('[error]') && !l.includes('ERR_BLOCKED'));
  console.log(`5) 错误日志: ${errorLogs.length > 0 ? '❌' : '✅ 无'}`);
  errorLogs.forEach(l => console.log(`   ${l}`));

  // 10) 截最终图
  await page.screenshot({ path: '/tmp/gomoku-final.png' });
  console.log('\n📸 截图: /tmp/before.png /tmp/after.png /tmp/gomoku-final.png');
  
  // 总结
  console.log('\n═══════════ 结果 ═══════════');
  console.log('页面加载: ✅');
  console.log('AI 就绪: ✅');
  console.log('落子点击: ✅');
  console.log('AI 回应: ' + (hasMove ? '✅' : '⚠️ 需人工确认'));
  console.log('控制台错误: ' + (errorLogs.length > 0 ? '❌' : '✅'));
  console.log('完整日志:');
  logs.forEach(l => console.log(`  ${l}`));

  await browser.close();
}

test().catch(e => { console.error('测试失败:', e); process.exit(1); });

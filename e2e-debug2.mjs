import { chromium } from 'playwright';
const URL = 'https://5.hfive.ggff.net';
async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  
  await page.goto(URL, { waitUntil: 'commit', timeout: 30000 });
  console.log('页面加载完成');
  
  // 记录前10秒的日志
  await page.waitForTimeout(10000);
  
  // 检查是否有错误或 ready 信号
  const readyLogs = logs.filter(l => l.includes('ready') || l.includes('Engine') || l.includes('error') || l.includes('Error'));
  console.log('10秒时关键日志:', readyLogs.length);
  readyLogs.slice(-10).forEach(l => console.log('  ', l));
  
  // 等模型下载
  await page.waitForTimeout(55000);
  
  console.log('\n最终日志:');
  const finalLogs = logs.filter(l => l.includes('ready') || l.includes('Engine') || l.includes('error') || l.includes('Error') || l.includes('Rapfi'));
  finalLogs.forEach(l => console.log('  ', l));
  
  const canvas = await page.$('canvas');
  console.log('\nCanvas存在:', !!canvas);
  console.log('AI就绪:', logs.some(l => l.includes('AI 就绪')));
  console.log('总日志数:', logs.length);
  
  await browser.close();
}
test().catch(e => { console.error('失败:', e.message); process.exit(1); });

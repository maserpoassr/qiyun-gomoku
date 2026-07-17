/**
 * 棋韵引擎加载器 v3
 * 
 * 职责：检测浏览器能力，加载最合适的 Rapfi WASM 变体
 * 加载链（降级）：multi-simd128 → multi → single-simd128 → single
 * 
 * 所有 wasm 和 js 文件预置于 /build/ 目录下
 */

const VARIANTS = [
  { id: 'multi-simd128', js: '/build/rapfi-multi-simd128.js', wasm: '/build/rapfi-multi-simd128.wasm', simd: true, multi: true },
  { id: 'multi',         js: '/build/rapfi-multi.js',         wasm: '/build/rapfi-multi.wasm',         simd: false, multi: true },
  { id: 'single-simd128',js: '/build/rapfi-single-simd128.js',wasm: '/build/rapfi-single-simd128.wasm', simd: true, multi: false },
  { id: 'single',        js: '/build/rapfi-single.js',        wasm: '/build/rapfi-single.wasm',        simd: false, multi: false },
];

/**
 * 检测浏览器能力
 */
function detectCapabilities() {
  const caps = { simd: false, multiThread: false };

  // SIMD 检测
  if (typeof WebAssembly !== 'undefined' && WebAssembly.validate) {
    // 尝试编译一个极简 SIMD 模块
    try {
      const simdTest = new Uint8Array([
        0, 97, 115, 109, // magic
        1, 0, 0, 0,      // version
        0x01, 5, 1, 0x60, 0, 0, // type section: func() -> ()
        0x03, 2, 1, 0,   // func section: 1 func
        0x0d, 7, 1,      // simd section
        0xfd, 0x0f, 1, 0, 0, 0, 0, 0, 0, 0, // i8x16.splat
        0x0b,            // end
        0x07, 5, 1, 0x04, 0x6d, 0x61, 0x69, 0x6e, 0, 0, // export "main"
        0x0a, 4, 1, 2, 0, 0x0b // code section
      ]);
      caps.simd = WebAssembly.validate(simdTest);
    } catch {
      // 静默失败，视为不支持
    }
  }

  // 多线程检测
  if (typeof SharedArrayBuffer !== 'undefined' && typeof navigator !== 'undefined' && navigator.hardwareConcurrency > 1) {
    caps.multiThread = true;
  }

  return caps;
}

/**
 * 动态加载 JS 脚本
 */
function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load: ${url}`));
    document.head.appendChild(script);
  });
}

/**
 * 选择最佳引擎变体
 */
function selectVariant(caps) {
  // 按优先级尝试
  const candidates = VARIANTS.filter(v => {
    if (v.simd && !caps.simd) return false;
    if (v.multi && !caps.multiThread) return false;
    return true;
  });

  if (candidates.length === 0) {
    // 最坏情况：回退到单线程非 SIMD
    return VARIANTS[VARIANTS.length - 1];
  }

  // 返回最高优先级（第一个匹配的）
  return candidates[0];
}

/**
 * 加载引擎
 * @param {function} onProgress - 加载进度回调 (0-100)
 * @returns {Promise<{rapfi: object, variant: string}>}
 */
export async function loadEngine(onProgress) {
  const caps = detectCapabilities();
  console.log('[Engine] 浏览器能力:', JSON.stringify(caps));

  const variant = selectVariant(caps);
  console.log(`[Engine] 选择变体: ${variant.id}`);

  onProgress?.(10);
  
  // 从最优先变体开始尝试降级链
  const startIdx = VARIANTS.findIndex(v => v.id === variant.id);
  
  for (let i = startIdx; i < VARIANTS.length; i++) {
    const v = VARIANTS[i];
    try {
      onProgress?.(15 + (i - startIdx) * 5);
      await loadScript(v.js);
      onProgress?.(60);
      
      // 等待 Rapfi 就绪（脚本挂载全局 Rapfi 构造函数）
      if (typeof Rapfi === 'undefined') {
        throw new Error('Rapfi 构造函数未定义');
      }
      
      // 初始化引擎
      const module = await Rapfi({
        locateFile: (file) => {
          if (file.endsWith('.wasm')) return `/build/${v.id}.wasm`;
          if (file.endsWith('.data')) return `/model/rapfi.data`;
          return `/build/${file}`;
        },
        onProgress: (pct) => {
          onProgress?.(60 + Math.round(pct * 0.35));
        },
        print: (msg) => console.log('[Rapfi]', msg),
        printErr: (msg) => console.error('[Rapfi]', msg),
      });

      onProgress?.(100);
      console.log(`[Engine] ✅ 引擎加载成功: ${v.id}`);
      return { rapfi: module, variant: v.id };
    } catch (err) {
      console.warn(`[Engine] ❌ 变体 ${v.id} 加载失败:`, err.message);
      onProgress?.(60 + (i - startIdx) * 10);
      // 继续尝试下一个降级变体
    }
  }

  throw new Error('所有引擎变体均加载失败');
}

/**
 * 简单检测是否支持多线程
 */
export function isMultiThreadSupported() {
  return typeof SharedArrayBuffer !== 'undefined' && typeof Worker !== 'undefined';
}

export { detectCapabilities, VARIANTS };

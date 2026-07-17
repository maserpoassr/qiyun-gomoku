/**
 * 棋韵引擎加载器 v3 — Vite Worker + 主线程降级
 * 
 * 加载策略：
 *   1. 尝试 new Worker(import.meta.url) → Vite 解析绝对路径
 *   2. Worker 内加载 rapfi-multi-simd128（如果浏览器支持）
 *   3. Worker 失败 → 主线程加载 rapfi-single（零 Worker 依赖）
 * 
 * 这样无论浏览器多线程是否支持，引擎都能跑起来。
 */

// 降级链：越高优先
const VARIANTS = [
  { id: 'multi-simd128', simd: true,  multi: true  },
  { id: 'multi',         simd: false, multi: true  },
  { id: 'single-simd128',simd: true,  multi: false },
  { id: 'single',        simd: false, multi: false },
];

/** 检测浏览器能力 */
function detectCaps() {
  const caps = { simd: false, multiThread: false };
  // SIMD
  if (typeof WebAssembly !== 'undefined') {
    try {
      // 通过验证一个包含 SIMD 指令的最小 wasm 模块来检测
      const simdBin = new Uint8Array([
        0, 0x61, 0x73, 0x6d, 1, 0, 0, 0,
        1, 5, 1, 0x60, 0, 0,
        3, 2, 1, 0,
        0x0d, 7, 1,
        0xfd, 0x0f, 1, 0, 0, 0, 0, 0, 0, 0,
        0x0b,
        7, 5, 1, 0x04, 0x6d, 0x61, 0x69, 0x6e, 0, 0,
        0x0a, 4, 1, 2, 0, 0x0b,
      ]);
      caps.simd = WebAssembly.validate(simdBin);
    } catch { /* 不支持 */ }
  }
  // 多线程
  if (typeof SharedArrayBuffer !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      navigator.hardwareConcurrency > 1) {
    caps.multiThread = true;
  }
  return caps;
}

/** 选择最佳匹配变体 */
function pickVariant(caps) {
  for (const v of VARIANTS) {
    if (v.simd && !caps.simd) continue;
    if (v.multi && !caps.multiThread) continue;
    return v;
  }
  return VARIANTS[VARIANTS.length - 1]; // 保底 single
}

/**
 * 尝试在 Worker 线程中加载引擎（多线程模式）
 */
function tryWorkerVariant(variant, modelURL, onProgress) {
  return new Promise((resolve, reject) => {
    // Vite 语法：new URL() 会在构建时被静态分析，保证 Worker 路径正确
    const worker = new Worker(
      new URL('../workers/rapfi.worker.js', import.meta.url),
      { type: 'module' }
    );

    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('Worker 初始化超时（15s）'));
    }, 15000);

    worker.onmessage = (e) => {
      const { type, data } = e.data;
      switch (type) {
        case 'ready':
          clearTimeout(timeout);
          onProgress?.(90);
          resolve({ worker, rapfi: null /* Worker 内调用通过 postMessage */ });
          break;
        case 'status':
          // 引擎内部状态消息，可用于进度估算
          if (typeof data === 'number') {
            onProgress?.(60 + Math.round(data * 0.3));
          }
          break;
        case 'stdout':
          console.log('[Rapfi]', data);
          break;
        case 'stderr':
          console.error('[Rapfi]', data);
          break;
        case 'error':
          clearTimeout(timeout);
          worker.terminate();
          reject(new Error(data));
          break;
        case 'exit':
          clearTimeout(timeout);
          console.log('[Rapfi] 引擎退出, code:', data);
          break;
      }
    };

    worker.onerror = (err) => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(err.message || 'Worker 加载失败'));
    };

    worker.postMessage({
      type: 'init',
      data: { variant: variant.id, modelURL },
    });
  });
}

/**
 * 在主线程直接加载引擎（单线程降级模式）
 */
function loadMainThread(variant) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `/build/rapfi-${variant.id}.js`;
    script.onload = async () => {
      try {
        if (typeof Rapfi === 'undefined') {
          throw new Error('Rapfi 构造函数未定义');
        }
        const module = await Rapfi({
          locateFile: (f) => {
            if (/\.data$/.test(f)) return `/model/rapfi.data`;
            if (/\.wasm$/.test(f)) return `/build/rapfi-${variant.id}.wasm`;
            return `/build/${f}`;
          },
          print: (m) => console.log('[Rapfi]', m),
          printErr: (m) => console.error('[Rapfi]', m),
        });
        resolve({ worker: null, rapfi: module });
      } catch (err) {
        reject(err);
      }
    };
    script.onerror = () => reject(new Error(`脚本加载失败: /build/rapfi-${variant.id}.js`));
    document.head.appendChild(script);
  });
}

/**
 * 主入口：加载引擎（自动检测 + 降级）
 * 
 * @param {function} onProgress - 进度回调 (0-100)
 * @returns {Promise<{worker: Worker|null, rapfi: object|null, variant: string, multiThread: boolean}>}
 */
export async function loadEngine(onProgress) {
  const caps = detectCaps();
  console.log('[Engine] 浏览器:', JSON.stringify(caps));

  const variant = pickVariant(caps);
  onProgress?.(10);
  console.log(`[Engine] 目标变体: ${variant.id}`);

  const modelURL = '/model/rapfi.data';

  // 优先尝试 Worker 模式（多线程）
  if (caps.multiThread && variant.multi) {
    try {
      onProgress?.(20);
      console.log(`[Engine] 尝试 Worker 模式: ${variant.id}`);
      const result = await tryWorkerVariant(variant, modelURL, onProgress);
      onProgress?.(100);
      console.log(`[Engine] ✅ Worker 模式成功: ${variant.id}`);
      return { ...result, variant: variant.id, multiThread: true };
    } catch (err) {
      console.warn(`[Engine] Worker 模式失败:`, err.message);
      onProgress?.(40);
      // 降级到主线程模式
    }
  }

  // 降级：主线程单线程模式
  console.log(`[Engine] 降级到主线程: single`);
  onProgress?.(50);
  try {
    const result = await loadMainThread({ id: 'single' });
    onProgress?.(100);
    console.log('[Engine] ✅ 主线程模式成功: single');
    return { ...result, variant: 'single', multiThread: false };
  } catch (err) {
    throw new Error(`所有引擎加载方式均失败: ${err.message}`);
  }
}

export function isMultiThreadSupported() {
  return typeof SharedArrayBuffer !== 'undefined' &&
         typeof Worker !== 'undefined' &&
         navigator.hardwareConcurrency > 1;
}

/**
 * 棋韵引擎加载器 — Vite ?worker 语法版
 *
 * 使用 Vite 的 ?worker 后缀确保打包路径绝对正确
 * Worker 内通过 importScripts 加载原版引擎，Vite 不会二次压缩
 */

// Vite 特定语法：?worker 告诉 Vite 将模块打包为独立的 Worker 文件
import RapfiWorker from '../workers/rapfi.worker.js?worker';

const VARIANTS = [
  { id: 'multi-simd128', simd: true, multi: true },
  { id: 'multi', simd: false, multi: true },
  { id: 'single-simd128', simd: true, multi: false },
  { id: 'single', simd: false, multi: false },
];

function detectCaps() {
  const caps = { simd: false, multiThread: false };
  if (typeof WebAssembly !== 'undefined') {
    try {
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
  if (
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    navigator.hardwareConcurrency > 1
  ) {
    caps.multiThread = true;
  }
  return caps;
}

/**
 * 初始化引擎
 *
 * @param {function} onProgress - 进度回调 (0-100)
 * @returns {Promise<{worker: Worker, variant: string, multiThread: boolean}>}
 */
export function initEngine(onProgress) {
  return new Promise((resolve, reject) => {
    const caps = detectCaps();
    onProgress?.(10);

    // 实例化 Worker
    const worker = new RapfiWorker();
    onProgress?.(30);

    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new Error('Worker 初始化超时（30s）'));
    }, 30000);

    worker.onmessage = function (event) {
      const data = event.data;
      if (!data) return;

      switch (data.type) {
        case 'ready':
          clearTimeout(timeout);
          onProgress?.(100);
          console.log('[Engine] ✅ 引擎就绪');
          resolve({
            worker,
            variant: 'rapfi-multi-simd128',
            multiThread: caps.multiThread,
          });
          break;

        case 'stdout':
          console.log('[Rapfi]', data.msg || data.data);
          break;

        case 'stderr':
          console.error('[Rapfi]', data.msg || data.data);
          break;

        case 'error':
          clearTimeout(timeout);
          worker.terminate();
          reject(new Error(data.data || data.msg || 'Worker 错误'));
          break;

        default:
          console.log('[Worker]', data);
      }
    };

    worker.onerror = function (err) {
      clearTimeout(timeout);
      worker.terminate();
      reject(new Error(err.message || 'Worker 加载失败'));
    };
  });
}

export function isMultiThreadSupported() {
  return (
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    navigator.hardwareConcurrency > 1
  );
}

/**
 * 棋韵引擎 Worker — Vite 托管，路径解析由构建工具保证
 * 
 * 接收主线程指令，加载 Rapfi WASM 引擎并执行对弈计算
 * 通过 postMessage 返回结果
 */

let rapfi = null;

// ─── 全局路径拦截器 ───
// Emscripten 引擎在加载 rapfi-*.js 前通过 Module.locateFile 寻址
// 必须在 importScripts 之前设置，引擎初始化时自动读取
self.Module = self.Module || {};
self.Module.locateFile = function(path, scriptDirectory) {
  if (path.endsWith('.data')) {
    // 40MB 权重文件 → 指向 Pages Function 代理
    return '/model/rapfi.data';
  }
  if (path.endsWith('.wasm')) {
    return '/build/' + path;
  }
  return scriptDirectory + path;
};

// 收到主线程消息
self.onmessage = async function (e) {
  const { type, data } = e.data;

  try {
    switch (type) {
      case 'init':
        await initEngine(data);
        break;
      case 'command':
        if (rapfi && rapfi.sendCommand) {
          rapfi.sendCommand(data);
        }
        break;
      default:
        console.warn('[Worker] 未知指令:', type);
    }
  } catch (err) {
    self.postMessage({ type: 'error', data: err.message });
  }
};

/**
 * 初始化 Rapfi 引擎
 */
async function initEngine({ variant, modelURL }) {
  const basePath = `/build/`;
  const jsURL = `${basePath}rapfi-${variant}.js`;

  // 通过 importScripts 加载 Rapfi 胶水代码
  self.importScripts(jsURL);

  if (typeof self.Rapfi === 'undefined') {
    throw new Error(`Rapfi 构造函数未定义 (variant: ${variant})`);
  }

  // 配置 locateFile — 使用绝对路径，Worker 在任意上下文都能正确解析
  const locateFile = (filename) => {
    if (/\.data$/.test(filename)) {
      return modelURL || `${basePath}rapfi-${variant}.data`;
    }
    if (/\.wasm$/.test(filename)) {
      return `${basePath}rapfi-${variant}.wasm`;
    }
    return `${basePath}${filename}`;
  };

  // 初始化引擎 — 不使用自定义 wasmMemory，Rapfi 内部自动处理
  rapfi = await self.Rapfi({
    locateFile,
    onReceiveStdout: (msg) => self.postMessage({ type: 'stdout', data: msg }),
    onReceiveStderr: (msg) => self.postMessage({ type: 'stderr', data: msg }),
    onExit: (code) => self.postMessage({ type: 'exit', data: code }),
    setStatus: (msg) => self.postMessage({ type: 'status', data: msg }),
  });

  self.postMessage({ type: 'ready' });
}

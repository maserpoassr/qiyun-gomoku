/**
 * 棋韵引擎 Worker — Vite 托管，路径解析由构建工具保证
 * 
 * 接收主线程指令，加载 Rapfi WASM 引擎并执行对弈计算
 * 通过 postMessage 返回结果
 */

let rapfi = null;

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

  // 初始化引擎
  rapfi = await self.Rapfi({
    locateFile,
    wasmMemory: data?.memoryArgs
      ? new WebAssembly.Memory(data.memoryArgs)
      : undefined,
    onReceiveStdout: (msg) => self.postMessage({ type: 'stdout', data: msg }),
    onReceiveStderr: (msg) => self.postMessage({ type: 'stderr', data: msg }),
    onExit: (code) => self.postMessage({ type: 'exit', data: code }),
    setStatus: (msg) => self.postMessage({ type: 'status', data: msg }),
  });

  self.postMessage({ type: 'ready' });
}

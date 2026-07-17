// src/workers/rapfi.worker.js

// 1. 强制劫持底层 WebAssembly 的文件加载路由
self.Module = {
  locateFile: function (path, scriptDirectory) {
    if (path.endsWith('.data')) {
      return '/model/rapfi.data';
    }
    if (path.endsWith('.wasm')) {
      return '/build/' + path;
    }
    return (scriptDirectory || '/build/') + path;
  },
  print: function (text) {
    self.postMessage({ type: 'stdout', msg: text });
  },
  printErr: function (text) {
    self.postMessage({ type: 'stderr', msg: text });
  },
};

// 2. 同步装载底层引擎胶水代码
try {
  importScripts('/build/rapfi-multi-simd128.js');
} catch (e) {
  try {
    importScripts('/build/rapfi-single.js');
  } catch (e2) {
    console.error('[Worker] 所有引擎变体均加载失败');
  }
}

// 3. 【核心】保存 Emscripten 原生的消息处理器（用于管理多线程 Pthreads）
const emscriptenOnMessage = self.onmessage;

// 4. 初始化引擎实例（在 importScripts 完成后执行）
let rapfi = null;

if (typeof self.Rapfi !== 'undefined') {
  self.Rapfi({
    locateFile: self.Module.locateFile,
    print: self.Module.print,
    printErr: self.Module.printErr,
  })
    .then(function (instance) {
      rapfi = instance;
      self.postMessage({ type: 'ready' });
    })
    .catch(function (err) {
      console.error('[Worker] Rapfi 初始化失败:', err);
      self.postMessage({ type: 'error', data: err.message });
    });
} else {
  self.postMessage({ type: 'error', data: 'Rapfi 构造函数未定义' });
}

// 5. 【核心修复】安全钩子拦截器 — 不阻塞 Pthread 内部信号
self.onmessage = function (event) {
  const data = event.data;
  if (!data) return;

  // 判定是否为我们派发的五子棋游戏指令
  let cmdStr = '';

  if (typeof data === 'string') {
    // 我们的指令以 YX / GO / INFO 开头
    if (data.startsWith('YX') || data === 'GO' || data.startsWith('INFO')) {
      cmdStr = data;
    }
  } else if (data.cmd) {
    cmdStr = data.cmd;
  } else if (data.data && typeof data.data === 'string') {
    if (
      data.data.startsWith('YX') ||
      data.data === 'GO' ||
      data.data.startsWith('INFO')
    ) {
      cmdStr = data.data;
    }
  }

  if (cmdStr) {
    // 游戏指令，喂给 WASM 引擎
    if (rapfi && rapfi.sendCommand) {
      rapfi.sendCommand(cmdStr);
    } else if (self.Module && self.Module.ccall) {
      self.Module.ccall('Command', 'void', ['string'], [cmdStr]);
    } else {
      console.warn('[Worker] 引擎未就绪，暂存指令:', cmdStr);
    }
  } else {
    // 非游戏指令 → 原封不动转发给 Emscripten 原生处理器（Pthread 信号等）
    if (emscriptenOnMessage) {
      emscriptenOnMessage(event);
    }
  }
};

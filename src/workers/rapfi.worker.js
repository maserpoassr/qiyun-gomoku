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

// 2. 装载底层引擎胶水代码
try {
  importScripts('/build/rapfi-multi-simd128.js');
} catch (e) {
  try {
    importScripts('/build/rapfi-single.js');
  } catch (e2) {
    console.error('[Worker] 所有引擎变体均加载失败');
  }
}

// 3. 【最关键】保存 Emscripten 原生的消息监听器
const emscriptenOnMessage = self.onmessage;

// 4. 初始化引擎（必须等待 async 初始化完成）
if (typeof self.Rapfi !== 'undefined') {
  self.Rapfi({
    locateFile: self.Module.locateFile,
    print: self.Module.print,
    printErr: self.Module.printErr,
  })
    .then(function () {
      self.postMessage({ type: 'ready' });
    })
    .catch(function (err) {
      self.postMessage({ type: 'error', data: err.message });
    });
} else {
  self.postMessage({ type: 'error', data: 'Rapfi 构造函数未定义' });
}

// 5. 安全代理钩子：解构后全量转发给 Emscripten 原生处理器
self.onmessage = function (event) {
  const data = event.data;
  if (!data) return;

  if (emscriptenOnMessage) {
    // 兼容多格式转发:
    //   { cmd: 'run', ... }    → Emscripten Pthread 信号, 原封不动
    //   { type: 'command', data: 'GO' } → 游戏指令, 解出纯字符串
    //   纯字符串 'GO'          → 直接转发
    if (data.cmd) {
      // Emscripten 内部线程信号（cmd 格式），原封不动
      emscriptenOnMessage(event);
    } else if (typeof data === 'object' && data.type === 'command' && typeof data.data === 'string') {
      // 游戏指令对象 → 解构为纯字符串转发给 C++ stdin
      const syntheticEvent = { ...event, data: data.data };
      emscriptenOnMessage(syntheticEvent);
    } else if (typeof data === 'string') {
      // 已经是纯字符串 → 直接转发
      emscriptenOnMessage(event);
    } else {
      // 其他格式（如 type:'ready'/type:'error'），原封不动
      emscriptenOnMessage(event);
    }
  }
};

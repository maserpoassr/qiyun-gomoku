// src/workers/rapfi.worker.js

// 状态控制：WASM 运行时是否完全就绪
let isWasmReady = false;
const commandQueue = [];

// 释放并执行队列中的积压指令
function executeQueue() {
  if (!isWasmReady || !self.Module.ccall) return;
  while (commandQueue.length > 0) {
    const cmd = commandQueue.shift();
    callEngine(cmd);
  }
}

// 统一执行 C++ 核心调用
function callEngine(cmdStr) {
  try {
    self.Module.ccall('sendCommand', 'void', ['string'], [cmdStr]);
  } catch (e) {
    try {
      self.Module.ccall('Command', 'void', ['string'], [cmdStr]);
    } catch (err) {
      console.error('[Worker] 引擎调用失败:', cmdStr, err);
    }
  }
}

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
  onRuntimeInitialized: function () {
    isWasmReady = true;
    self.postMessage({ type: 'ready' });
    executeQueue();
  },
};

// 2. 动态同步装载底层引擎胶水代码
try {
  importScripts('/build/rapfi-multi-simd128.js');
} catch (e) {
  try {
    importScripts('/build/rapfi-single.js');
  } catch (err) {
    console.error('[Worker] 所有引擎脚本加载失败');
  }
}

// 保存 Emscripten 原生的消息监听器
const emscriptenOnMessage = self.onmessage;

// 3. 接收并处理主线程指令
self.onmessage = function (event) {
  const data = event.data;
  if (!data) return;

  let cmdStr = '';
  let isGameCommand = false;

  if (typeof data === 'string') {
    cmdStr = data;
    if (data.startsWith('YX') || data === 'GO' || data.startsWith('INFO')) {
      isGameCommand = true;
    }
  } else if (data.cmd) {
    cmdStr = data.cmd;
    isGameCommand = true;
  } else if (data.type === 'command' && typeof data.data === 'string') {
    cmdStr = data.data;
    isGameCommand = true;
  }

  if (isGameCommand && cmdStr) {
    if (isWasmReady && self.Module.ccall) {
      callEngine(cmdStr);
    } else {
      commandQueue.push(cmdStr);
    }
  } else {
    // 转发原生多线程同步信号，绝不拦截
    if (emscriptenOnMessage) {
      emscriptenOnMessage(event);
    }
  }
};

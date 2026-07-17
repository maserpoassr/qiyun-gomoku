// src/workers/rapfi.worker.js

// 状态控制
let isWasmReady = false;
const commandQueue = [];

function executeQueue() {
  if (!isWasmReady || !self.Module.ccall) return;
  while (commandQueue.length > 0) {
    const cmd = commandQueue.shift();
    callEngine(cmd);
  }
}

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

// ==========================================
// 【核心修复】安全初始化 self.Module，严禁覆盖原有属性
// Emscripten 在多线程模式下会预注入线程配置（thread ID、pthread 句柄等）
// 直接自赋值会清空这些参数，导致子线程死锁
// ==========================================
self.Module = self.Module || {};

// 安全包装 locateFile
const origLocateFile = self.Module.locateFile;
self.Module.locateFile = function (path, scriptDirectory) {
  if (path.endsWith('.data')) return '/model/rapfi.data';
  if (path.endsWith('.wasm')) return '/build/' + path;
  return origLocateFile
    ? origLocateFile(path, scriptDirectory)
    : (scriptDirectory || '/build/') + path;
};

// 安全包装输出流
const origPrint = self.Module.print;
self.Module.print = function (text) {
  self.postMessage({ type: 'stdout', msg: text });
  if (origPrint) origPrint(text);
};

const origPrintErr = self.Module.printErr;
self.Module.printErr = function (text) {
  self.postMessage({ type: 'stderr', msg: text });
  if (origPrintErr) origPrintErr(text);
};

// 安全包装初始化完成回调
const origOnInit = self.Module.onRuntimeInitialized;
self.Module.onRuntimeInitialized = function () {
  isWasmReady = true;
  self.postMessage({ type: 'ready' });
  executeQueue();
  if (origOnInit) origOnInit();
};

// ==========================================
// 加载引擎核心 + 显式初始化 WASM
// ==========================================
try {
  importScripts('/build/rapfi-multi-simd128.js');
} catch (e) {
  try {
    importScripts('/build/rapfi-single.js');
  } catch (err) {
    console.error('[Worker] 所有引擎加载失败');
  }
}

// 【关键】显式调用 Rapfi() 初始化 WASM 运行时
// 使用旧版兼容的 callback 命名（onReceiveStdout/Stderr, setStatus）
if (typeof self.Rapfi !== 'undefined') {
  self.Rapfi({
    locateFile: self.Module.locateFile,
    onReceiveStdout: function (text) {
      self.postMessage({ type: 'stdout', msg: text });
    },
    onReceiveStderr: function (text) {
      self.postMessage({ type: 'stderr', msg: text });
    },
    setStatus: function (text) {
      if (text === 'Running...' || text === '') return;
      self.postMessage({ type: 'status', msg: text });
    },
    onExit: function (code) {
      self.postMessage({ type: 'exit', data: code });
    },
  }).then(function () {
    if (!isWasmReady) {
      isWasmReady = true;
      self.postMessage({ type: 'ready' });
      executeQueue();
    }
  }).catch(function (err) {
    self.postMessage({ type: 'error', data: err.message || String(err) });
  });
  // 安全兜底
  setTimeout(function () {
    if (!isWasmReady) {
      self.postMessage({ type: 'error', data: 'Worker WASM 初始化超时（60s）' });
    }
  }, 60000);
} else {
  self.postMessage({ type: 'error', data: 'Rapfi 构造函数未定义' });
}

// ==========================================
// 安全包装消息接收器，保留子线程同步通道
// ==========================================
const emscriptenOnMessage = self.onmessage;

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
    // 子线程同步信号等，原封不动交还给 Emscripten
    if (emscriptenOnMessage) {
      emscriptenOnMessage(event);
    }
  }
};

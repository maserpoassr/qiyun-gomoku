// src/workers/rapfi.worker.js

// 状态控制
let isWasmReady = false;
const commandQueue = [];
let rapfi = null;

function executeQueue() {
  if (!isWasmReady || !rapfi?.sendCommand) return;
  while (commandQueue.length > 0) {
    const cmd = commandQueue.shift();
    callEngine(cmd);
  }
}

function callEngine(cmdStr) {
  if (typeof rapfi?.sendCommand === 'function') {
    rapfi.sendCommand(cmdStr);
  } else {
    console.warn('[Worker] 引擎未就绪:', cmdStr);
  }
}

// ==========================================
// 安全初始化 self.Module，保护线程上下文
// ==========================================
self.Module = self.Module || {};

const origLocateFile = self.Module.locateFile;
self.Module.locateFile = function (path, scriptDirectory) {
  if (path.endsWith('.data')) return '/model/rapfi.data';
  if (path.endsWith('.wasm')) return '/build/' + path;
  return origLocateFile
    ? origLocateFile(path, scriptDirectory)
    : (scriptDirectory || '/build/') + path;
};

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

const origOnInit = self.Module.onRuntimeInitialized;
self.Module.onRuntimeInitialized = function () {
  isWasmReady = true;
  self.postMessage({ type: 'ready' });
  executeQueue();
  if (origOnInit) origOnInit();
};

// ==========================================
// 【核心】只加载单线程引擎 — 零 pthread 依赖
// rapfi-single.js 不会创建子 Worker，兼容所有浏览器环境
// ==========================================
try {
  importScripts('/build/rapfi-single.js');
} catch (err) {
  console.error('[Worker] 单线程引擎加载失败:', err);
}

// 初始化 WASM
if (typeof self.Rapfi !== 'undefined') {
  self.Rapfi({
    locateFile: self.Module.locateFile,
    onReceiveStdout: function (text) {
      self.postMessage({ type: 'stdout', data: text });
    },
    onReceiveStderr: function (text) {
      self.postMessage({ type: 'stderr', data: text });
    },
    setStatus: function (text) {
      if (text === 'Running...' || text === '') return;
      self.postMessage({ type: 'status', msg: text });
    },
    onExit: function (code) {
      self.postMessage({ type: 'exit', data: code });
    },
  }).then(function (instance) {
    rapfi = instance;
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
      self.postMessage({ type: 'error', data: 'Worker WASM 初始化超时' });
    }
  }, 60000);
} else {
  self.postMessage({ type: 'error', data: 'Rapfi 构造函数未定义' });
}

// 安全钩子：非游戏指令转发给 Emscripten 原生处理器
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
    self.postMessage({ type: 'debug', data: '收到指令: ' + cmdStr });
    if (isWasmReady && rapfi?.sendCommand) {
      callEngine(cmdStr);
    } else {
      commandQueue.push(cmdStr);
    }
  } else {
    if (emscriptenOnMessage) {
      emscriptenOnMessage(event);
    }
  }
};

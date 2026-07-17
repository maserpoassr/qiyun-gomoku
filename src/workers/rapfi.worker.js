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

// 2. 装载底层引擎（多线程优先，逐级降级）
(function () {
  const variants = [
    '/build/rapfi-multi-simd128.js',
    '/build/rapfi-multi.js',
    '/build/rapfi-single-simd128.js',
    '/build/rapfi-single.js',
  ];
  for (const url of variants) {
    try {
      self.importScripts(url);
      if (typeof self.Rapfi !== 'undefined') {
        console.log('[Worker] 引擎装载成功:', url);
        return;
      }
    } catch (e) {
      console.warn('[Worker] 变体加载失败:', url, e.message);
    }
  }
  console.error('[Worker] 所有引擎变体均加载失败');
})();

// 3. 初始化引擎实例
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

// 4. 双协议兼容通信（核心修复）
self.onmessage = function (event) {
  const data = event.data;
  if (!data) return;

  // 【核心】提取指令字符串：兼容 字符串直接传输 / {cmd} / {type,data} / {type,cmd}
  let cmdStr = '';

  if (typeof data === 'string') {
    cmdStr = data;
  } else if (data.cmd) {
    cmdStr = data.cmd;
  } else if (data.data && typeof data.data === 'string') {
    cmdStr = data.data; // { type: 'command', data: 'GO' }
  } else if (data.type === 'command' && data.msg) {
    cmdStr = data.msg;
  }

  if (cmdStr) {
    if (rapfi && rapfi.sendCommand) {
      rapfi.sendCommand(cmdStr);
    } else if (self.Module && self.Module.ccall) {
      self.Module.ccall('Command', 'void', ['string'], [cmdStr]);
    } else {
      console.warn('[Worker] 引擎未就绪，漏掉指令:', cmdStr);
    }
  } else {
    // 忽略调试消息
    if (data.type !== 'ping' && data.type !== 'ready' && data.type !== 'stdout' && data.type !== 'stderr' && data.type !== 'error') {
      console.log('[Worker] 忽略未知格式消息:', JSON.stringify(data).slice(0, 100));
    }
  }
};

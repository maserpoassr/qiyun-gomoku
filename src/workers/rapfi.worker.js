// ─── 强制劫持底层 WebAssembly 的文件加载路由 ───
// 必须在 importScripts 之前设置，引擎初始化时自动读取
self.Module = {
  locateFile: function (path, scriptDirectory) {
    // 强制 40MB 模型文件指向 R2 代理
    if (path.endsWith('.data')) {
      return '/model/rapfi.data';
    }
    // 强制 WASM 去 /build/ 下找
    if (path.endsWith('.wasm')) {
      return '/build/' + path;
    }
    return (scriptDirectory || '/build/') + path;
  },
  print: function (text) {
    self.postMessage({ type: 'stdout', data: text });
  },
  printErr: function (text) {
    self.postMessage({ type: 'stderr', data: text });
  },
};

// 利用 importScripts 引入挂在 public/build/ 下的原版引擎
// 不会被 Vite 二次压缩破坏作用域
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

// 初始化引擎实例（在 importScripts 完成后执行）
let rapfi = null;

if (typeof self.Rapfi !== 'undefined') {
  self.Rapfi({
    locateFile: self.Module.locateFile,
    print: self.Module.print,
    printErr: self.Module.printErr,
  }).then(function (instance) {
    rapfi = instance;
    self.postMessage({ type: 'ready' });
  }).catch(function (err) {
    console.error('[Worker] Rapfi 初始化失败:', err);
    self.postMessage({ type: 'error', data: err.message });
  });
} else {
  self.postMessage({ type: 'error', data: 'Rapfi 构造函数未定义' });
}

// 接收主线程通信指令
self.onmessage = function (event) {
  const data = event.data;
  if (!data) return;

  switch (data.type) {
    case 'command':
      if (rapfi && rapfi.sendCommand) {
        rapfi.sendCommand(data.cmd);
      } else if (rapfi && rapfi.ccall) {
        rapfi.ccall('Command', 'void', ['string'], [data.cmd]);
      }
      break;
    default:
      console.warn('[Worker] 未知指令:', data.type);
  }
};

import { createApp, ref, onMounted } from 'vue';
import App from './App.vue';
import { loadEngine, isMultiThreadSupported } from './engine/loader.js';

const app = createApp(App);

// 挂载前注入引擎加载状态
app.provide('engineState', {
  loading: ref(true),
  progress: ref(0),
  error: ref(null),
  engine: ref(null),
  variant: ref(''),
  multiThread: ref(false),
});

app.mount('#gomoku-root');

// 引擎加载（mount 后启动）
const provides = app._instance?.appContext?.provides;
// 直接通过 app-level global properties 暴露
app.config.globalProperties.$engine = null;

// 在下一个 tick 启动引擎加载
setTimeout(async () => {
  try {
    const mt = isMultiThreadSupported();
    console.log(`[App] 多线程${mt ? '✅ 支持' : '❌ 不支持'}`);
    
    const result = await loadEngine((pct) => {
      // 通过自定义事件通知 App
      window.dispatchEvent(new CustomEvent('engine-progress', { detail: pct }));
    });
    
    app.config.globalProperties.$engine = result.rapfi;
    window.dispatchEvent(new CustomEvent('engine-ready', { 
      detail: { variant: result.variant, multiThread: mt }
    }));
  } catch (err) {
    console.error('[App] 引擎加载失败:', err);
    window.dispatchEvent(new CustomEvent('engine-error', { 
      detail: { message: err.message }
    }));
  }
}, 100);

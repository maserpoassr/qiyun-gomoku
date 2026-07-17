<template>
  <div id="gomoku-root">
    <!-- 引擎加载屏 -->
    <transition name="fade">
      <div v-if="!ready && !fatal" class="loading-screen">
        <div class="loader-logo">棋<span>韵</span></div>
        <div class="loader-bar-container">
          <div class="loader-bar-fill" :style="{ width: progress + '%' }"></div>
        </div>
        <div class="loader-text">{{ statusText }}</div>
        <div class="loader-variant" v-if="statusMsg">
          <template v-if="progress < 50">检测浏览器能力...</template>
          <template v-else-if="progress < 70 && useWorker">启动 Worker 线程...</template>
          <template v-else-if="progress < 70 && !useWorker">主线程加载中...</template>
          <template v-else-if="progress < 100">引擎初始化...</template>
          <template v-else>就绪 ✓</template>
        </div>
      </div>
    </transition>

    <!-- 致命错误 -->
    <transition name="fade">
      <div v-if="fatal" class="error-screen">
        <div class="error-icon">⚠</div>
        <div class="error-title">引擎加载失败</div>
        <div class="error-detail">{{ errorMessage }}</div>
        <button class="error-retry" @click="retry">重新加载</button>
        <div class="error-fallback">
          <p>请尝试：</p>
          <ul>
            <li>使用最新版 Chrome/Edge 浏览器</li>
            <li>关闭广告拦截插件</li>
            <li>强制刷新页面 (Ctrl+F5)</li>
          </ul>
        </div>
      </div>
    </transition>

    <!-- 旧 Vue 2 游戏容器 — 引擎就绪后显示 -->
    <div id="app" v-show="ready" style="display:none"></div>
  </div>
</template>

<script>
export default {
  name: 'AppRoot',
  data() {
    return {
      ready: false,
      fatal: false,
      progress: 0,
      variant: '',
      useWorker: true,
      isMultiThread: false,
      errorMessage: '',
    };
  },
  computed: {
    statusText() {
      if (this.progress < 15) return '检测浏览器能力...';
      if (this.progress < 50) return '选择引擎变体...';
      if (this.progress < 70) return this.useWorker ? '启动 Worker 线程...' : '主线程加载中...';
      if (this.progress < 95) return '引擎初始化中...';
      return '引擎就绪 ✓';
    },
  },
  mounted() {
    window.addEventListener('engine-progress', (e) => {
      this.progress = Math.min(100, Math.max(0, e.detail || 0));
    });
    window.addEventListener('engine-ready', (e) => {
      this.variant = e.detail.variant;
      this.useWorker = e.detail.hasWorker;
      this.isMultiThread = e.detail.multiThread;
      this.progress = 100;
      console.log(`[App] 引擎就绪: ${e.detail.variant} | Worker: ${e.detail.hasWorker} | 多线程: ${e.detail.multiThread}`);
      setTimeout(() => { this.ready = true; }, 400);
    });
    window.addEventListener('engine-error', (e) => {
      this.fatal = true;
      this.errorMessage = e.detail.message || '未知错误';
    });
    // 30 秒超时保护
    this._timeout = setTimeout(() => {
      if (!this.ready && !this.fatal) {
        this.fatal = true;
        this.errorMessage = '引擎加载超时（30s），请检查网络或刷新重试';
      }
    }, 30000);
  },
  unmounted() {
    clearTimeout(this._timeout);
  },
  methods: {
    retry() {
      this.fatal = false;
      this.progress = 0;
      this.errorMessage = '';
      window.location.reload();
    },
  },
};
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.4s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.loading-screen {
  position: fixed; inset: 0;
  background: radial-gradient(circle at center, #2a2a2a 0%, #1a1a1a 100%);
  display: flex; flex-direction: column;
  justify-content: center; align-items: center;
  z-index: 9999;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
.loader-logo {
  font-size: 28px; font-weight: 300;
  color: #e0e0e0; margin-bottom: 24px;
  letter-spacing: 8px;
}
.loader-logo span { font-weight: 700; color: #d4af37; }
.loader-bar-container {
  width: 200px; height: 3px;
  background: rgba(255,255,255,0.1);
  border-radius: 3px; overflow: hidden;
}
.loader-bar-fill {
  height: 100%; background: #d4af37;
  transition: width 0.25s ease;
  box-shadow: 0 0 12px #d4af37;
}
.loader-text {
  color: #999; font-size: 13px;
  margin-top: 12px; letter-spacing: 2px;
}
.loader-variant {
  color: #666; font-size: 11px;
  margin-top: 6px;
}
.error-screen {
  position: fixed; inset: 0;
  background: #1a1a1a; display: flex;
  flex-direction: column; justify-content: center;
  align-items: center; z-index: 9999;
  color: #e0e0e0; font-family: -apple-system, sans-serif;
  padding: 20px; text-align: center;
}
.error-icon { font-size: 48px; margin-bottom: 16px; }
.error-title { font-size: 22px; margin-bottom: 8px; }
.error-detail { color: #ff6b6b; font-size: 14px; margin-bottom: 20px; max-width: 400px; word-break: break-all; }
.error-retry {
  background: #d4af37; color: #1a1a1a;
  border: none; padding: 10px 32px; font-size: 15px;
  border-radius: 6px; cursor: pointer; margin-bottom: 20px;
}
.error-fallback { color: #666; font-size: 12px; }
.error-fallback ul { text-align: left; margin-top: 4px; }
</style>

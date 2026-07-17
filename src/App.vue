<template>
  <div id="gomoku-app">
    <router-view v-if="false" />
    <!-- 棋韵 Vue 3 入口 — 实际使用 public/ 中已有的 Vue 2 编译产物 -->
    <!-- 后续在此逐步迁移至 Vue 3 组件 -->
  </div>
</template>

<script>
export default {
  name: 'App',
};
</script>

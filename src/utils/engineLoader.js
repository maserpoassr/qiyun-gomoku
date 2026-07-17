import localforage from 'localforage';

// 配置本地数据库
localforage.config({
  name: 'qiyun-gomoku',
  storeName: 'model_cache',
});

const MODEL_KEY = 'rapfi_model_data';
const MODEL_URL = '/model/rapfi.data'; // 指向本域的 Pages Function 代理

/**
 * 带进度的模型加载器
 * 1. 优先尝试 IndexedDB 缓存
 * 2. 缓存未命中则流式下载
 * 3. 下载完成后存入 IndexedDB
 * 4. 返回 Blob
 * 
 * @param {function} onProgress - 进度回调 (0-100)
 * @returns {Promise<Blob>}
 */
export async function loadModelWithProgress(onProgress) {
  // 1. 尝试从 IndexedDB 读取缓存
  try {
    const cachedData = await localforage.getItem(MODEL_KEY);
    if (cachedData) {
      onProgress(100); // 缓存命中，直接 100%
      console.log('[ModelLoader] 缓存命中，跳过下载');
      return cachedData;
    }
  } catch (err) {
    console.warn('[ModelLoader] IndexedDB 读取失败，回退网络下载:', err);
  }

  // 2. 缓存未命中，发起流式下载
  const response = await fetch(MODEL_URL);
  if (!response.ok) {
    throw new Error(`无法连接到模型分发服务器: ${response.status}`);
  }

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  if (total === 0) {
    console.warn('[ModelLoader] 服务器未返回 Content-Length，进度条可能无法正常显示');
  }

  const reader = response.body.getReader();
  let receivedLength = 0;
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    receivedLength += value.length;

    if (total > 0) {
      const progress = Math.round((receivedLength / total) * 100);
      onProgress(progress); // 触发 UI 进度更新
    }
  }

  // 3. 拼接二进制数据
  const modelBlob = new Blob(chunks);

  // 4. 存入 IndexedDB 缓存
  try {
    await localforage.setItem(MODEL_KEY, modelBlob);
    console.log('[ModelLoader] 模型已缓存到 IndexedDB');
  } catch (err) {
    console.error('[ModelLoader] 存储模型到 IndexedDB 失败（可能空间不足）:', err);
  }

  return modelBlob;
}

/**
 * 清除缓存的模型数据
 */
export async function clearModelCache() {
  try {
    await localforage.removeItem(MODEL_KEY);
    console.log('[ModelLoader] 模型缓存已清除');
  } catch (err) {
    console.error('[ModelLoader] 清除缓存失败:', err);
  }
}

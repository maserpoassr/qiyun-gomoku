// _worker.js
var worker_default = {
  async fetch(request, env, ctx) {
    return env.ASSETS.fetch(request);
  }
};
export {
  worker_default as default
};

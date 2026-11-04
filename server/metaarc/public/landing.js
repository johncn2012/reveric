// 官网交互：若片头仍有指令条，逐字打出。
// 主按钮文案固定为「下载 Windows 内测包」。安装包地址只在更新清单允许时由 metaarc.js 写入。
(function () {
  const stage = document.getElementById('stage');

  // 开发期把 cineview 的配置错误打到控制台
  stage.addEventListener('cv-error', (e) => console.warn('[cineview]', e.detail.code, e.detail.message));

  // 全文一开始就在 DOM 里，只是逐字显色，不会引起重排
  function typewriter(el, msPerChar) {
    const text = el.textContent;
    const shown = document.createElement('span');
    const rest = document.createElement('span');
    rest.style.color = 'transparent';
    rest.textContent = text;
    el.replaceChildren(shown, rest);
    let n = 0;
    (function step() {
      shown.textContent = text.slice(0, ++n);
      rest.textContent = text.slice(n);
      if (n < text.length) setTimeout(step, msPerChar);
    })();
  }
  const cmd = document.getElementById('cmd');
  if (cmd && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setTimeout(() => typewriter(cmd, 70), 900);
  }
})();

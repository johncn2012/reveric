// 官网交互：片头指令逐字打出；按访客系统把主按钮指向对应安装包
(function () {
  const stage = document.getElementById('stage');

  // 开发期把 cineview 的配置错误打到控制台
  stage.addEventListener('cv-error', (e) => console.warn('[cineview]', e.detail.code, e.detail.message));

  // T3 打字机：全文一开始就在 DOM 里，只是逐字显色，不会引起重排
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

  // 只有下载卡片带有 http(s) 地址时，才把主按钮指向该地址。
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? 'android'
    : /iPhone|iPad|iPod/i.test(ua) ? null
    : /Windows/i.test(ua) ? 'win'
    : /Macintosh|Mac OS X/i.test(ua) ? 'mac'
    : null;
  const names = { mac: 'macOS', win: 'Windows', android: 'Android' };
  const card = os && document.querySelector(`.dl[data-os="${os}"]`);
  const href = card && card.getAttribute('href');
  if (card && href && /^https?:\/\//.test(href)) {
    card.classList.add('is-mine');
    const primary = document.getElementById('primary-dl');
    primary.href = href;
    primary.firstChild.textContent = `下载 ${names[os]} 版 `;
    const alts = document.getElementById('alt-dl');
    alts.querySelectorAll('a').forEach((a) => {
      if (a.textContent === names[os]) a.remove();
    });
  }
})();

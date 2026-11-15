/**
 * 同域账号中心与管理员工作台。
 * 规范路径：POST /api/auth/login、POST /api/auth/register、GET /api/auth/profile、
 * GET /api/auth/orders、GET /api/auth/quota/logs。套餐名称来自 GET /api/plans。
 * 管理员读取 /api/admin/users、/api/admin/tasks、/api/admin/media、/api/admin/orders、
 * /api/admin/plans。用户任务与文件来自 /api/tasks/list、/api/media/list。
 * 密钥轮换走 /api/auth/reset-api-key，登录记录走 /api/auth/login-logs。
 * 不创建订单，也不汇总金额。
 */
(function () {
  const TOKEN_KEY = 'metaarc_account_token';
  const surface = location.pathname.indexOf('/admin') === 0 ? 'admin' : 'account';
  const USER_VIEWS = ['overview', 'plan', 'usage', 'downloads', 'security', 'orders', 'support'];
  const ADMIN_VIEWS = ['workspace', 'users', 'plans', 'orders-admin', 'usage-review', 'security-settings', 'releases', 'diagnostics', 'audit'];
  const TITLES = {
    overview: ['个人空间', '概览'],
    plan: ['个人空间', '订阅与权益'],
    usage: ['个人空间', '用量明细'],
    downloads: ['个人空间', '下载与更新'],
    security: ['个人空间', '账号安全'],
    orders: ['个人空间', '订单记录'],
    support: ['个人空间', '诊断与支持'],
    workspace: ['运营与系统', '每一项运营，都有清楚去向。'],
    users: ['运营与系统', '用户与权限'],
    plans: ['运营与系统', '套餐与定价'],
    'orders-admin': ['运营与系统', '订单管理'],
    'usage-review': ['运营与系统', '用量核对'],
    'security-settings': ['运营与系统', '系统安全策略与访问限制'],
    releases: ['运营与系统', '发布更新'],
    diagnostics: ['运营与系统', '诊断与健康'],
    audit: ['运营与系统', '审计日志'],
  };

  const alertEl = document.getElementById('alert');
  const gate = document.getElementById('gate');
  const consoleEl = document.getElementById('console');
  const gateTitle = document.getElementById('gate-title');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const forgotForm = document.getElementById('forgot-form');
  const loginLinks = document.getElementById('login-links');
  const modal = document.getElementById('modal');
  const modalForm = document.getElementById('modal-form');
  let currentUser = null;
  let plans = [];
  let userFilter = '';
  let orderFilter = '';
  let currentUserPage = 1;
  let currentOrderPage = 1;
  let currentTasksPage = 1;
  let currentMediaPage = 1;
  let currentAuditPage = 1;
  let currentLoginLogsPage = 1;
  let currentQuotaReviewPage = 1;
  const selectedUserIds = new Set();
  let alertTimer = null;

  function token() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setToken(value) {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  }
  function $(id) { return document.getElementById(id); }
  function showAlert(message, ok) {
    alertEl.hidden = false;
    alertEl.textContent = message;
    alertEl.classList.toggle('is-ok', !!ok);
    clearTimeout(alertTimer);
    alertTimer = setTimeout(function () { alertEl.hidden = true; }, 4200);

    const gateError = $('gate-error');
    if (gateError) {
      if (ok || !message) {
        gateError.hidden = true;
      } else {
        gateError.hidden = false;
        gateError.textContent = message;
      }
    }
  }
  async function request(path, options) {
    const headers = { Accept: 'application/json' };
    if (options && options.body) headers['Content-Type'] = 'application/json';
    if (token()) headers.Authorization = 'Bearer ' + token();
    const res = await fetch(path, {
      method: (options && options.method) || 'GET',
      headers: headers,
      body: options && options.body ? JSON.stringify(options.body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    return { ok: res.ok, status: res.status, data: data };
  }
  function errorMessage(result, fallback) {
    return (result && result.data && result.data.message) || fallback;
  }
  function num(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
  }
  function formatNumber(value) {
    const amount = num(value);
    return amount === null ? '—' : amount.toLocaleString('zh-CN');
  }
  function formatWhen(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('zh-CN', { hour12: false });
  }
  function planName(slug) {
    const found = plans.find(function (plan) { return plan.slug === slug; });
    return found ? found.name : (slug || '未知套餐');
  }
  function channelLabel(channel) {
    const value = typeof channel === 'string' ? channel.trim().toLowerCase() : '';
    if (value === 'internal') return '内测';
    if (value === 'beta') return '测试';
    if (value === 'stable') return '正式版';
    return '';
  }
  function payChannelLabel(channel) {
    const value = typeof channel === 'string' ? channel.trim().toLowerCase() : '';
    if (value === 'wechat' || value === 'offline_wechat') return '微信支付';
    if (value === 'alipay' || value === 'offline_alipay') return '支付宝';
    if (value === 'bank_transfer') return '公对公转账';
    if (value === 'offline') return '线下对账';
    if (value === 'admin' || value === 'admin_comp') return '管理员特批';
    return channel || '—';
  }
  function formatBytes(bytes) {
    const b = Number(bytes);
    if (!Number.isFinite(b) || b <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return (b / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1) + ' ' + sizes[i];
  }
  function simplifyUserAgent(ua) {
    if (!ua || typeof ua !== 'string') return '—';
    if (ua.indexOf('MetaArc') !== -1 || ua.indexOf('Reveric') !== -1) return 'MetaArc 官方客户端';
    if (ua.indexOf('Windows') !== -1) return 'Windows 设备';
    if (ua.indexOf('Macintosh') !== -1 || ua.indexOf('Mac OS') !== -1) return 'macOS 设备';
    if (ua.indexOf('Android') !== -1) return 'Android 移动端';
    if (ua.indexOf('iPhone') !== -1 || ua.indexOf('iPad') !== -1) return 'iOS 移动端';
    if (ua.indexOf('Linux') !== -1) return 'Linux 设备';
    return ua.slice(0, 30);
  }
  function renderPagination(containerId, pagination, onPageChange) {
    const container = $(containerId);
    if (!container) return;
    if (!pagination || pagination.total === 0 || pagination.totalPages <= 1) {
      container.replaceChildren();
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'pagination';

    const info = document.createElement('span');
    info.textContent = '共 ' + formatNumber(pagination.total) + ' 条记录，第 ' + pagination.page + ' / ' + pagination.totalPages + ' 页';

    const btnBox = document.createElement('div');
    btnBox.className = 'page-btns';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.textContent = '上一页';
    prevBtn.disabled = pagination.page <= 1;
    prevBtn.addEventListener('click', function () {
      if (pagination.page > 1) onPageChange(pagination.page - 1);
    });

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.textContent = '下一页';
    nextBtn.disabled = pagination.page >= pagination.totalPages;
    nextBtn.addEventListener('click', function () {
      if (pagination.page < pagination.totalPages) onPageChange(pagination.page + 1);
    });

    btnBox.append(prevBtn, nextBtn);
    wrap.append(info, btnBox);
    container.replaceChildren(wrap);
  }
  function person(row) {
    return row.nickname || row.email || row.phone || row.account || '未命名';
  }
  function fill(id, node) {
    const slot = $(id);
    if (!slot) return;
    slot.replaceChildren(node);
  }
  function empty(text) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = text;
    return p;
  }
  function table(columns, rows) {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const el = document.createElement('table');
    const head = document.createElement('tr');
    columns.forEach(function (column) {
      const th = document.createElement('th');
      if (typeof column.header === 'function') {
        column.header(th);
      } else {
        th.textContent = column.label;
      }
      head.append(th);
    });
    const thead = document.createElement('thead');
    thead.append(head);
    const body = document.createElement('tbody');
    rows.forEach(function (row) {
      const tr = document.createElement('tr');
      columns.forEach(function (column) {
        const td = document.createElement('td');
        column.fill(td, row);
        tr.append(td);
      });
      body.append(tr);
    });
    el.append(thead, body);
    wrap.append(el);
    return wrap;
  }
  function textCell(value) {
    return function (td) { td.textContent = value == null || value === '' ? '—' : String(value); };
  }

  let publicAuthConfig = {
    allow_registration: true,
    require_login_captcha: true,
    require_email_code: false,
    cf_turnstile_enabled: false,
    cf_turnstile_site_key: '',
  };
  let loginTurnstileWidgetId = null;
  let registerTurnstileWidgetId = null;
  let forgotTurnstileWidgetId = null;
  let loginTurnstileToken = '';
  let registerTurnstileToken = '';
  let forgotTurnstileToken = '';
  let emailCodeTimer = null;
  let forgotEmailCodeTimer = null;

  function resetTurnstile(target) {
    if (target === true || target === 'login') {
      loginTurnstileToken = '';
      if (window.turnstile && loginTurnstileWidgetId !== null) {
        try { window.turnstile.reset(loginTurnstileWidgetId); } catch (_) {}
      }
    } else if (target === false || target === 'register') {
      registerTurnstileToken = '';
      if (window.turnstile && registerTurnstileWidgetId !== null) {
        try { window.turnstile.reset(registerTurnstileWidgetId); } catch (_) {}
      }
    } else if (target === 'forgot') {
      forgotTurnstileToken = '';
      if (window.turnstile && forgotTurnstileWidgetId !== null) {
        try { window.turnstile.reset(forgotTurnstileWidgetId); } catch (_) {}
      }
    }
  }

  async function loadPublicAuthConfig() {
    try {
      const res = await request('/api/auth/config');
      if (res.ok && res.data && res.data.data) {
        publicAuthConfig = res.data.data;
      }
    } catch (_) {}
  }

  async function refreshLoginCaptcha() {
    try {
      const res = await request('/api/auth/captcha');
      if (res.ok && res.data && res.data.data) {
        const d = res.data.data;
        if ($('login-captcha-id')) $('login-captcha-id').value = d.captchaId;
        if ($('login-captcha-img')) $('login-captcha-img').src = d.dataUri || ('data:image/svg+xml;utf8,' + encodeURIComponent(d.svg));
        if ($('login-captcha-code')) $('login-captcha-code').value = '';
      }
    } catch (_) {}
  }

  function renderTurnstileWidget(containerId, target) {
    if (!publicAuthConfig.cf_turnstile_enabled || !publicAuthConfig.cf_turnstile_site_key) {
      const el = $(containerId);
      if (el) el.hidden = true;
      return;
    }
    const el = $(containerId);
    if (!el) return;
    el.hidden = false;

    function doRender() {
      if (!window.turnstile) return;
      try {
        const wId = window.turnstile.render('#' + containerId, {
          sitekey: publicAuthConfig.cf_turnstile_site_key,
          theme: 'light',
          callback: function (token) {
            if (target === true || target === 'login') loginTurnstileToken = token;
            else if (target === false || target === 'register') registerTurnstileToken = token;
            else if (target === 'forgot') forgotTurnstileToken = token;
          },
          'expired-callback': function () {
            if (target === true || target === 'login') loginTurnstileToken = '';
            else if (target === false || target === 'register') registerTurnstileToken = '';
            else if (target === 'forgot') forgotTurnstileToken = '';
          },
        });
        if (target === true || target === 'login') loginTurnstileWidgetId = wId;
        else if (target === false || target === 'register') registerTurnstileWidgetId = wId;
        else if (target === 'forgot') forgotTurnstileWidgetId = wId;
      } catch (_) {}
    }

    if (window.turnstile) {
      doRender();
    } else {
      let tries = 0;
      const t = setInterval(function () {
        tries++;
        if (window.turnstile) {
          clearInterval(t);
          doRender();
        } else if (tries > 30) {
          clearInterval(t);
        }
      }, 200);
    }
  }

  async function initGateSecurity(mode) {
    await loadPublicAuthConfig();

    // 1. 注册开关与界面呈现
    const regClosedAlert = $('register-closed-alert');
    const regFields = $('register-fields');
    const showRegBtn = $('show-register');
    if (publicAuthConfig.allow_registration === false) {
      if (regClosedAlert) regClosedAlert.hidden = false;
      if (regFields) regFields.hidden = true;
      if (showRegBtn) showRegBtn.title = '系统当前已暂停开放新用户自主注册';
    } else {
      if (regClosedAlert) regClosedAlert.hidden = true;
      if (regFields) regFields.hidden = false;
    }

    // 2. 登录图形验证码
    const loginCaptchaRow = $('login-captcha-row');
    if (loginCaptchaRow) {
      if (publicAuthConfig.require_login_captcha) {
        loginCaptchaRow.hidden = false;
        refreshLoginCaptcha();
      } else {
        loginCaptchaRow.hidden = true;
      }
    }

    // 3. 注册邮箱验证码
    const regEmailCodeRow = $('register-email-code-row');
    if (regEmailCodeRow) {
      regEmailCodeRow.hidden = !publicAuthConfig.require_email_code;
    }

    // 4. Cloudflare Turnstile 人机验证
    if (mode === 'login') {
      renderTurnstileWidget('login-turnstile-container', 'login');
    } else if (mode === 'register') {
      renderTurnstileWidget('register-turnstile-container', 'register');
    } else if (mode === 'forgot') {
      renderTurnstileWidget('forgot-turnstile-container', 'forgot');
    }
  }

  async function handleSendEmailCode() {
    const account = $('register-account').value.trim();
    if (!account || account.indexOf('@') === -1) {
      return showAlert('请先在上方输入有效的注册邮箱');
    }

    const btn = $('btn-send-email-code');
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    btn.textContent = '发送中...';

    const body = {
      email: account,
      turnstile_token: registerTurnstileToken,
    };

    const res = await request('/api/auth/send-email-code', {
      method: 'POST',
      body: body,
    });

    if (!res.ok) {
      btn.disabled = false;
      btn.textContent = '获取验证码';
      resetTurnstile(false);
      return showAlert(errorMessage(res, '发送验证码失败'));
    }

    showAlert('验证码已发送，请查收您的邮箱', true);

    let cooldown = (res.data && res.data.cooldownSeconds) || 60;
    btn.disabled = true;
    btn.textContent = cooldown + 's 后重发';
    clearInterval(emailCodeTimer);
    emailCodeTimer = setInterval(function () {
      cooldown--;
      if (cooldown <= 0) {
        clearInterval(emailCodeTimer);
        btn.disabled = false;
        btn.textContent = '重新获取';
      } else {
        btn.textContent = cooldown + 's 后重发';
      }
    }, 1000);
  }

  async function handleSendForgotEmailCode() {
    const emailInput = $('forgot-email');
    const sendBtn = $('btn-forgot-send-code');
    if (!emailInput || !sendBtn) return;
    const email = emailInput.value.trim();
    if (!email || email.indexOf('@') === -1) {
      showAlert('请输入有效的注册邮箱地址');
      return;
    }

    if (publicAuthConfig.cf_turnstile_enabled && publicAuthConfig.cf_turnstile_site_key && !forgotTurnstileToken) {
      showAlert('请先完成人机交互安全验证');
      return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = '正在发送…';

    const body = { email: email };
    if (publicAuthConfig.cf_turnstile_enabled && publicAuthConfig.cf_turnstile_site_key) {
      body.turnstile_token = forgotTurnstileToken;
    }

    const res = await request('/api/auth/forgot-password/send-code', {
      method: 'POST',
      body: body,
    });

    if (!res.ok) {
      sendBtn.disabled = false;
      sendBtn.textContent = '获取验证码';
      resetTurnstile('forgot');
      showAlert((res.data && res.data.message) || '验证码发送失败，请核对邮箱后重试');
      return;
    }

    showAlert('重置验证码已发送至您的邮箱，请注意查收（10分钟内有效）');

    let countdown = 60;
    sendBtn.disabled = true;
    sendBtn.textContent = countdown + 's 后重发';
    if (forgotEmailCodeTimer) clearInterval(forgotEmailCodeTimer);
    forgotEmailCodeTimer = setInterval(function () {
      countdown--;
      if (countdown <= 0) {
        clearInterval(forgotEmailCodeTimer);
        forgotEmailCodeTimer = null;
        sendBtn.disabled = false;
        sendBtn.textContent = '重新获取';
      } else {
        sendBtn.textContent = countdown + 's 后重发';
      }
    }, 1000);
  }

  function showGate(mode) {
    gate.hidden = false;
    consoleEl.hidden = true;
    const gateError = $('gate-error');
    if (gateError) gateError.hidden = true;
    loginForm.hidden = mode !== 'login';
    registerForm.hidden = mode !== 'register';
    forgotForm.hidden = mode !== 'forgot';
    loginLinks.hidden = mode !== 'login';
    gateTitle.textContent = mode === 'register' ? '注册账号' : (mode === 'forgot' ? '重置密码' : '进入创作台');
    initGateSecurity(mode);
  }
  function showApp() {
    alertEl.hidden = true;
    gate.hidden = true;
    consoleEl.hidden = false;
    const admin = currentUser && currentUser.role === 'admin';
    $('user-nav').hidden = surface === 'admin';
    $('admin-nav').hidden = surface !== 'admin' || !admin;
    $('admin-entry').hidden = !admin;
    $('who-name').textContent = currentUser.nickname || currentUser.email || currentUser.phone || '';
    const denied = surface === 'admin' && !admin;
    $('admin-denied').hidden = !denied;
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      panel.hidden = true;
    });
    if (denied) return;
    const stored = sessionStorage.getItem('metaarc_view_' + surface);
    const allowed = surface === 'admin' ? ADMIN_VIEWS : USER_VIEWS;
    showView(allowed.indexOf(stored) >= 0 ? stored : allowed[0]);
  }
  function showView(name) {
    if (surface === 'admin' && (!currentUser || currentUser.role !== 'admin')) return;
    sessionStorage.setItem('metaarc_view_' + surface, name);
    document.querySelectorAll('[data-view]').forEach(function (button) {
      button.classList.toggle('is-on', button.getAttribute('data-view') === name);
    });
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-panel') !== name;
    });
    const title = TITLES[name] || ['MetaArc', '概览'];
    $('console-kicker').textContent = title[0];
    $('console-title').textContent = name === 'overview' && currentUser
      ? '你好，' + (currentUser.nickname || '创作者') + '。'
      : title[1];
    const loaders = {
      overview: loadOverview,
      plan: loadPlan,
      usage: loadUsage,
      downloads: loadDownloads,
      security: loadSecurity,
      orders: loadOrders,
      support: loadSupport,
      workspace: loadWorkspace,
      users: loadUsers,
      plans: loadAdminPlans,
      'orders-admin': loadAdminOrders,
      'usage-review': loadQuotaReview,
      'security-settings': loadSecuritySettings,
      releases: surface === 'admin' ? loadReleasesAdmin : loadDownloads,
      diagnostics: loadDiagnostics,
      audit: loadAudit,
    };
    if (loaders[name]) loaders[name]();
  }

  function quotaBlock(user) {
    const wrap = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = '账户点数与云端存储';
    const remain = num(user.quota);
    const total = num(user.total_quota);
    const line = document.createElement('p');
    line.textContent = '算力点数：剩余 ' + formatNumber(remain) + ' / 累计发放 ' + formatNumber(total);
    const meter = document.createElement('div');
    meter.className = 'meter';
    const bar = document.createElement('span');
    const ratio = total > 0 && remain !== null ? Math.max(0, Math.min(100, (remain / total) * 100)) : 0;
    bar.style.width = ratio + '%';
    meter.append(bar);

    const usedBytes = num(user.storage_used_bytes) || 0;
    const limitMb = num(user.storage_limit_mb) || 500;
    const maxBytes = limitMb * 1024 * 1024;
    const usedMbStr = (usedBytes / (1024 * 1024)).toFixed(1);
    const storageRatio = maxBytes > 0 ? Math.max(0, Math.min(100, (usedBytes / maxBytes) * 100)) : 0;

    const storageTitle = document.createElement('p');
    storageTitle.style.marginTop = '14px';
    storageTitle.textContent = '云端存储：已用 ' + usedMbStr + ' MB / 上限 ' + limitMb + ' MB (' + (user.media_count || 0) + ' 个媒体文件)';

    const storageMeter = document.createElement('div');
    storageMeter.className = 'meter';
    const storageBar = document.createElement('span');
    storageBar.style.width = storageRatio + '%';
    if (storageRatio >= 90) {
      storageBar.style.background = '#b42318';
    }
    storageMeter.append(storageBar);

    const note = document.createElement('p');
    note.className = 'fine';
    note.textContent = '点数用于文本润色、小说分镜与音视频渲染；云端对象存储用于保存交付物文件。';
    wrap.append(title, line, meter, storageTitle, storageMeter, note);
    return wrap;
  }

  async function loadPlans() {
    const result = await request('/api/plans');
    plans = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : [];
  }
  async function loadOverview() {
    await loadPlans();
    const planCard = document.createElement('div');
    const h = document.createElement('h2');
    h.textContent = planName(currentUser.plan);
    const p = document.createElement('p');
    p.textContent = '权益以账号资料和套餐接口为准。在线支付尚未开通。';
    const jump = document.createElement('button');
    jump.className = 'text';
    jump.type = 'button';
    jump.textContent = '查看权益';
    jump.addEventListener('click', function () { showView('plan'); });
    planCard.append(h, p, jump);
    fill('overview-plan', planCard);
    fill('overview-quota', quotaBlock(currentUser));
    const orders = await request('/api/auth/orders');
    const slot = $('overview-orders');
    const count = orders.ok && orders.data && Array.isArray(orders.data.data) ? orders.data.data.length : 0;
    slot.textContent = count ? '有 ' + count + ' 条订单记录' : '暂无订单记录';
  }
  async function loadPlan() {
    await loadPlans();
    const match = plans.find(function (plan) { return plan.slug === currentUser.plan; });
    const wrap = document.createElement('div');
    const h = document.createElement('h2');
    h.textContent = match ? ('当前订阅：' + match.name) : ('当前订阅：' + planName(currentUser.plan));
    wrap.append(h);
    if (!match) {
      wrap.append(empty('当前套餐档位生效中。'));
    } else {
      const price = document.createElement('p');
      const yuan = num(match.price_cents);
      price.textContent = yuan === null ? '按量计费' : ('¥' + (yuan / 100).toLocaleString('zh-CN') + (match.billing_cycle === 'monthly' ? ' / 月' : ''));
      const points = document.createElement('p');
      points.textContent = '包含算力点数：' + formatNumber(match.quota_points) + ' 点';
      const closed = document.createElement('p');
      closed.className = 'fine';
      closed.textContent = '当前订阅生效中。如需扩充算力或变更档位，请联系商务支持。';
      wrap.append(price, points, closed);
      const features = Array.isArray(match.features) ? match.features : [];
      if (features.length) {
        const featList = document.createElement('ul');
        featList.style.margin = '12px 0 16px 20px';
        features.forEach(function (item) {
          if (typeof item !== 'string') return;
          const li = document.createElement('li');
          li.textContent = item;
          featList.append(li);
        });
        wrap.append(featList);
      }
    }

    if (plans && plans.length) {
      const allTitle = document.createElement('h3');
      allTitle.style.marginTop = '28px';
      allTitle.textContent = '全部可用套餐档位';
      wrap.append(allTitle);

      const grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(220px, 1fr))';
      grid.style.gap = '16px';
      grid.style.marginTop = '12px';

      plans.forEach(function (p) {
        const isCurrent = p.slug === currentUser.plan;
        const card = document.createElement('div');
        card.className = 'card' + (isCurrent ? ' is-current' : '');
        card.style.background = isCurrent ? '#f0fdf4' : 'var(--bg-card, #fff)';
        card.style.border = isCurrent ? '2px solid #16a34a' : '1px solid var(--border-color, #e2e8f0)';
        card.style.borderRadius = '8px';
        card.style.padding = '16px';

        const cTitle = document.createElement('h4');
        cTitle.style.margin = '0 0 8px 0';
        cTitle.textContent = p.name;
        if (isCurrent) {
          const badge = document.createElement('span');
          badge.className = 'badge badge-success';
          badge.style.marginLeft = '8px';
          badge.textContent = '当前生效';
          cTitle.append(badge);
        }

        const cPrice = document.createElement('p');
        cPrice.style.fontSize = '18px';
        cPrice.style.fontWeight = 'bold';
        cPrice.style.margin = '4px 0';
        cPrice.textContent = '¥' + (p.price_cents / 100).toFixed(2) + (p.billing_cycle === 'monthly' ? ' / 月' : '');

        const cPoints = document.createElement('p');
        cPoints.style.margin = '4px 0';
        cPoints.textContent = '算力：' + formatNumber(p.quota_points) + ' 点';

        const cDesc = document.createElement('p');
        cDesc.className = 'fine';
        cDesc.style.margin = '6px 0 0 0';
        cDesc.textContent = p.description || ((p.duration_days || 30) + '天有效');

        card.append(cTitle, cPrice, cPoints, cDesc);
        if (p.price_cents > 0) {
          const actBtn = document.createElement('button');
          actBtn.type = 'button';
          actBtn.className = isCurrent ? 'btn-line' : 'btn-primary';
          actBtn.style.marginTop = '12px';
          actBtn.style.width = '100%';
          actBtn.textContent = isCurrent ? '续费该套餐 / 对公汇款' : '订购该套餐 / 对公汇款';
          actBtn.addEventListener('click', function () {
            subscribePlanModal(p);
          });
          card.append(actBtn);
        } else {
          const freeNote = document.createElement('p');
          freeNote.className = 'fine';
          freeNote.style.marginTop = '12px';
          freeNote.style.color = '#64748b';
          freeNote.textContent = '注册默认享有，免费体验';
          card.append(freeNote);
        }
        grid.append(card);
      });
      wrap.append(grid);
    }
    fill('plan-detail', wrap);
  }

  async function subscribePlanModal(p) {
    const box = document.createElement('div');
    box.style.display = 'grid';
    box.style.gap = '12px';

    const infoCard = document.createElement('div');
    infoCard.style.padding = '12px';
    infoCard.style.background = '#f8fafc';
    infoCard.style.borderRadius = '6px';
    infoCard.style.border = '1px solid #e2e8f0';

    const pTitle = document.createElement('div');
    pTitle.style.fontWeight = 'bold';
    pTitle.style.fontSize = '16px';
    pTitle.textContent = p.name + ' — ¥' + (p.price_cents / 100).toFixed(2) + (p.billing_cycle === 'monthly' ? ' / 月' : '');

    const pMeta = document.createElement('div');
    pMeta.className = 'fine';
    pMeta.style.marginTop = '4px';
    pMeta.textContent = '包含算力：' + formatNumber(p.quota_points) + ' 点 | 周期有效期：' + (p.duration_days || 30) + ' 天';
    infoCard.append(pTitle, pMeta);

    const channelLabel = document.createElement('label');
    channelLabel.textContent = '汇款渠道';
    const channelSelect = document.createElement('select');
    [
      ['bank_transfer', '企业对公银行转账（支持开具增值税发票）'],
      ['offline_alipay', '支付宝转账 / 线下对账'],
      ['offline_wechat', '微信支付转账 / 线下对账'],
    ].forEach(function (pair) {
      const opt = document.createElement('option');
      opt.value = pair[0];
      opt.textContent = pair[1];
      channelSelect.append(opt);
    });

    const bankBox = document.createElement('div');
    bankBox.style.padding = '12px';
    bankBox.style.background = '#eff6ff';
    bankBox.style.borderRadius = '6px';
    bankBox.style.border = '1px solid #bfdbfe';
    bankBox.style.fontSize = '13px';
    bankBox.style.lineHeight = '1.6';
    bankBox.innerHTML = '<strong>官方对公账户信息：</strong><br>' +
      '• 户名：北京元弧智能科技有限公司<br>' +
      '• 开户行：招商银行股份有限公司北京分行<br>' +
      '• 账号：<code>1109 4528 8910 801</code><br>' +
      '<span class="fine" style="color:#1e40af">💡 汇款附言请务必填写您的注册手机号或订单号。提交后可在【订单记录】录入交易流水号，审核通过后即刻到账。</span>';

    const tradeNoLabel = document.createElement('label');
    tradeNoLabel.textContent = '转账单号 / 汇款流水号（选填，转账后亦可在订单列表中登记）';
    const tradeNoInput = document.createElement('input');
    tradeNoInput.placeholder = '例如招商银行转账流水号、支付宝交易单号等';

    box.append(infoCard, channelLabel, channelSelect, bankBox, tradeNoLabel, tradeNoInput);

    const answer = await ask({
      title: '订购套餐 — ' + p.name,
      copy: '确认订购该套餐。系统将生成正式订购凭单，支持对公对账与财务极速核销。',
      extra: box,
      reason: false,
      confirm: '提交并生成订单',
      collect: function () {
        return {
          planId: p.id,
          payChannel: channelSelect.value,
          payTradeNo: tradeNoInput.value.trim() || undefined,
        };
      },
    });
    if (!answer) return;

    const res = await request('/api/auth/orders/create', {
      method: 'POST',
      body: answer,
    });
    if (!res.ok) {
      return showAlert(errorMessage(res, '生成订单失败'));
    }

    const orderData = res.data && res.data.order ? res.data.order : {};
    showAlert('订单已生成（单号：' + (orderData.order_no || '已记录') + '），请根据账户指引完成付款', true);
    showView('orders');
    loadOrders(1);
  }
  async function loadSupport() {
    const slot = $('support-slot');
    if (!slot) return;
    const cat = await request('/api/updates/catalog');
    const health = await request('/api/health');

    const wrap = document.createElement('div');
    const h = document.createElement('h2');
    h.textContent = '技术支持与问题诊断';
    const lead = document.createElement('p');
    lead.textContent = '如果在客户端运行、模型生成、账号认证或权益充值过程中遇到任何异常，我们提供全方位的技术保障与人工支持。';
    wrap.append(h, lead);

    const contactCard = document.createElement('div');
    contactCard.style.padding = '16px';
    contactCard.style.margin = '16px 0';
    contactCard.style.background = '#f8fafc';
    contactCard.style.borderRadius = '8px';
    contactCard.style.border = '1px solid #e2e8f0';

    function addInfo(bText, tText, isLink, href) {
      const p = document.createElement('p');
      p.style.margin = '8px 0';
      const b = document.createElement('b');
      b.textContent = bText + '：';
      p.append(b);
      if (isLink) {
        const a = document.createElement('a');
        a.href = href || tText;
        a.textContent = tText;
        if (!href.startsWith('mailto:')) { a.target = '_blank'; a.rel = 'noreferrer'; }
        p.append(a);
      } else {
        p.append(document.createTextNode(tText));
      }
      contactCard.append(p);
    }
    addInfo('官方服务邮箱', 'contact@metaarc.com.cn', true, 'mailto:contact@metaarc.com.cn');
    addInfo('商务咨询微信', 'metaarc_service', false);
    addInfo('技术支持响应', '周一至周日 09:00 - 21:00 (通常在 2 小时内响应)', false);
    addInfo('使用指南与排查', '查看客户端帮助中心与排查手册', true, '/help/#support');
    wrap.append(contactCard);

    const diagCard = document.createElement('div');
    diagCard.style.padding = '16px';
    diagCard.style.background = '#fff';
    diagCard.style.borderRadius = '8px';
    diagCard.style.border = '1px solid #e2e8f0';
    const diagTitle = document.createElement('h3');
    diagTitle.style.margin = '0 0 10px 0';
    diagTitle.textContent = '本地诊断参考信息';
    diagCard.append(diagTitle);

    const clientVer = cat.ok && cat.data && cat.data.catalog && cat.data.catalog.version ? cat.data.catalog.version : '最新稳定版';
    const p1 = document.createElement('p');
    p1.style.margin = '6px 0';
    p1.innerHTML = '<b>云端服务状态：</b>' + (health.ok ? '<span class="badge badge-success">正常运行中</span>' : '<span class="badge badge-danger">服务异常</span>');
    const p2 = document.createElement('p');
    p2.style.margin = '6px 0';
    p2.innerHTML = '<b>客户端最新版本：</b>v' + clientVer;
    const p3 = document.createElement('p');
    p3.style.margin = '6px 0';
    p3.innerHTML = '<b>当前创作者 UID：</b><code>' + (currentUser ? currentUser.id : '—') + '</code>';
    const p4 = document.createElement('p');
    p4.className = 'fine';
    p4.style.marginTop = '10px';
    p4.textContent = '反馈问题时，请附带上述 UID 与发生时间，以便工程师快速定位日志。';
    diagCard.append(p1, p2, p3, p4);

    wrap.append(diagCard);
    fill('support-slot', wrap);
  }
  let currentUserLedgerPage = 1;
  async function loadUserLedger(page) {
    page = page || 1;
    currentUserLedgerPage = page;
    const params = new URLSearchParams();
    const typeSelect = $('user-ledger-type');
    const typeVal = typeSelect ? typeSelect.value.trim() : '';
    if (typeVal) params.set('type', typeVal);
    params.set('page', String(page));
    params.set('pageSize', '15');
    const ledger = await request('/api/auth/quota/logs?' + params.toString());
    renderLedger('ledger-slot', ledger);
    renderPagination('ledger-pages', ledger.data && ledger.data.pagination, function (p) {
      loadUserLedger(p);
    });
  }
  async function loadUsage() {
    fill('usage-summary', quotaBlock(currentUser));
    await loadUserLedger(1);
    const tasks = await request('/api/tasks/list');
    renderTasks('user-tasks-slot', tasks, false, function () { loadAccount(); });
    const media = await request('/api/media/list');
    renderMedia('user-media-slot', media, false, function () { loadAccount(); });
  }
  function renderLedger(id, result) {
    const rows = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : null;
    if (!rows) return fill(id, empty('点数流水暂时无法读取。'));
    if (!rows.length) return fill(id, empty('当前筛选条件下没有点数流水。'));
    const labels = { purchase: '充值到账', consumption: '创作消耗', admin_grant: '额度调整', refund: '退款冲正' };
    fill(id, table([
      { label: '时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
      { label: '变动点数', fill: function (td, row) {
        const num = parseFloat(row.amount);
        if (num > 0) {
          td.innerHTML = '<span style="color:#027a48; font-weight:600;">+' + formatNumber(num) + '</span>';
        } else if (num < 0) {
          td.innerHTML = '<span style="color:#b42318; font-weight:600;">' + formatNumber(num) + '</span>';
        } else {
          td.textContent = '0';
        }
      } },
      { label: '变动后结存', fill: function (td, row) { td.textContent = formatNumber(row.balance_after); } },
      { label: '业务类型', fill: function (td, row) { td.textContent = labels[row.type] || row.type || '—'; } },
      { label: '备注说明', fill: function (td, row) { td.textContent = row.remark || '—'; } },
    ], rows));
  }
  function taskStatusBadge(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'completed' || s === 'success') return '<span class="badge badge-success">已完成</span>';
    if (s === 'running' || s === 'processing') return '<span class="badge badge-warning">执行中</span>';
    if (s === 'pending') return '<span class="badge badge-neutral">排队中</span>';
    if (s === 'failed') return '<span class="badge badge-danger">已失败</span>';
    return '<span class="badge badge-neutral">' + (status || '—') + '</span>';
  }
  function renderTasks(id, result, admin, onReload) {
    const rows = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : null;
    if (!rows) return fill(id, empty('任务暂时无法读取。'));
    if (!rows.length) return fill(id, empty('没有创作任务。'));
    const columns = [
      { label: '类型', fill: function (td, row) { td.textContent = row.task_type || '—'; } },
      { label: '状态', fill: function (td, row) { td.innerHTML = taskStatusBadge(row.status); } },
      { label: '进度', fill: function (td, row) { td.textContent = (row.progress ?? 0) + '%'; } },
      { label: '耗时', fill: function (td, row) { td.textContent = row.duration_ms ? (row.duration_ms / 1000).toFixed(1) + 's' : '—'; } },
      { label: '时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
    ];
    if (admin) {
      columns.unshift({ label: '创作者', fill: function (td, row) { td.textContent = person(row); } });
    }
    columns.push({ label: '操作', fill: function (td, row) {
      const box = document.createElement('div');
      box.className = 'actions';
      const detailBtn = document.createElement('button');
      detailBtn.type = 'button';
      detailBtn.textContent = '详情';
      detailBtn.addEventListener('click', function () { return showTaskDetail(row, admin); });
      box.append(detailBtn);

      if (['pending', 'running', 'processing'].includes(row.status)) {
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.textContent = '终止';
        cancelBtn.addEventListener('click', function () { return cancelTask(row, onReload); });
        box.append(cancelBtn);
      }

      if (row.status === 'failed') {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.textContent = '重试';
        retryBtn.addEventListener('click', function () { return retryTask(row, onReload); });
        box.append(retryBtn);
      }

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = '删除';
      delBtn.addEventListener('click', function () { return deleteTask(row, onReload); });
      box.append(delBtn);

      td.append(box);
    } });
    fill(id, table(columns, rows));
  }
  async function showTaskDetail(row, admin) {
    const box = document.createElement('div');
    box.className = 'stack';
    function item(label, val) {
      const p = document.createElement('p');
      const b = document.createElement('b');
      b.textContent = label + '：';
      p.append(b, document.createTextNode(val || '—'));
      return p;
    }
    box.append(item('任务编号', row.id));
    if (admin) box.append(item('创作者', person(row)));
    box.append(item('类型', row.task_type));
    box.append(item('状态', row.status));
    box.append(item('客户端IP', row.client_ip));
    if (row.prompt) {
      const promptTitle = document.createElement('p');
      promptTitle.innerHTML = '<b>提示词 (Prompt)：</b>';
      const promptBox = document.createElement('pre');
      promptBox.style.background = '#f0f4f8';
      promptBox.style.padding = '8px';
      promptBox.style.borderRadius = '6px';
      promptBox.style.whiteSpace = 'pre-wrap';
      promptBox.style.wordBreak = 'break-all';
      promptBox.style.fontSize = '13px';
      promptBox.textContent = row.prompt;
      box.append(promptTitle, promptBox);
    }
    if (row.input_payload && typeof row.input_payload === 'object' && Object.keys(row.input_payload).length > 0) {
      const inTitle = document.createElement('p');
      inTitle.innerHTML = '<b>输入参数 (Input Payload)：</b>';
      const inBox = document.createElement('pre');
      inBox.style.background = '#f8fafc';
      inBox.style.border = '1px solid #e2e8f0';
      inBox.style.padding = '8px';
      inBox.style.borderRadius = '6px';
      inBox.style.whiteSpace = 'pre-wrap';
      inBox.style.wordBreak = 'break-all';
      inBox.style.fontSize = '13px';
      inBox.textContent = JSON.stringify(row.input_payload, null, 2);
      box.append(inTitle, inBox);
    }
    if (row.output_payload && typeof row.output_payload === 'object' && Object.keys(row.output_payload).length > 0) {
      const outTitle = document.createElement('p');
      outTitle.innerHTML = '<b>产出结果 (Output Payload)：</b>';
      const outBox = document.createElement('pre');
      outBox.style.background = '#f0fdf4';
      outBox.style.border = '1px solid #bbf7d0';
      outBox.style.padding = '8px';
      outBox.style.borderRadius = '6px';
      outBox.style.whiteSpace = 'pre-wrap';
      outBox.style.wordBreak = 'break-all';
      outBox.style.fontSize = '13px';
      outBox.textContent = JSON.stringify(row.output_payload, null, 2);
      box.append(outTitle, outBox);
    }
    if (row.error_message) {
      const errTitle = document.createElement('p');
      errTitle.innerHTML = '<b style="color:#b42318;">失败原因 / 报错：</b>';
      const errBox = document.createElement('pre');
      errBox.style.background = '#fdeeed';
      errBox.style.color = '#b42318';
      errBox.style.padding = '8px';
      errBox.style.borderRadius = '6px';
      errBox.style.whiteSpace = 'pre-wrap';
      errBox.style.fontSize = '13px';
      errBox.textContent = row.error_message;
      box.append(errTitle, errBox);
    }
    await ask({ title: '任务详情', reason: false, extra: box, modalClass: 'modal-lg', confirm: '关闭' });
  }
  async function cancelTask(row, onReload) {
    const answer = await ask({ title: '终止任务', copy: '终止该任务执行并标记为已取消。', confirm: '确认终止', reason: false });
    if (!answer) return;
    const isAdmin = currentUser && currentUser.role === 'admin';
    const url = isAdmin ? '/api/admin/tasks/' + row.id + '/cancel' : '/api/tasks/' + row.id + '/cancel';
    const result = await request(url, { method: 'POST' });
    if (!result.ok) return showAlert(errorMessage(result, '终止失败'));
    showAlert('任务已终止', true);
    if (onReload) onReload();
  }
  async function retryTask(row, onReload) {
    const answer = await ask({ title: '重试任务', copy: '将该失败任务重新放入待调度队列，重置进度并清除报错。', confirm: '确认重试', reason: false });
    if (!answer) return;
    const isAdmin = currentUser && currentUser.role === 'admin';
    const url = isAdmin ? '/api/admin/tasks/' + row.id + '/retry' : '/api/tasks/' + row.id + '/retry';
    const result = await request(url, { method: 'POST' });
    if (!result.ok) return showAlert(errorMessage(result, '重试任务失败'));
    showAlert('任务已重新排队等待调度执行', true);
    if (onReload) onReload();
  }
  async function deleteTask(row, onReload) {
    const answer = await ask({ title: '删除任务记录', copy: '从任务列表中永久清除该记录。', confirm: '确认删除', reason: false });
    if (!answer) return;
    const isAdmin = currentUser && currentUser.role === 'admin';
    const url = isAdmin ? '/api/admin/tasks/' + row.id : '/api/tasks/' + row.id;
    const result = await request(url, { method: 'DELETE' });
    if (!result.ok) return showAlert(errorMessage(result, '删除失败'));
    showAlert('任务记录已删除', true);
    if (onReload) onReload();
  }
  function renderMedia(id, result, admin, onReload) {
    const rows = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : null;
    if (!rows) return fill(id, empty('文件索引暂时无法读取。'));
    if (!rows.length) return fill(id, empty('没有云端文件记录。'));
    const columns = [
      { label: '预览', fill: function (td, row) {
        if (row.cdn_url && (row.asset_type === 'image' || (row.mime_type && row.mime_type.indexOf('image/') === 0))) {
          const img = document.createElement('img');
          img.src = row.cdn_url;
          img.className = 'thumb-preview';
          img.alt = '';
          img.loading = 'lazy';
          img.style.cursor = 'pointer';
          img.title = '点击查看大图与详情';
          img.onerror = function () {
            img.style.display = 'none';
            if (!td.querySelector('.thumb-fallback')) {
              const fallback = document.createElement('span');
              fallback.className = 'thumb-fallback';
              fallback.textContent = '🖼️';
              fallback.style.fontSize = '20px';
              fallback.style.cursor = 'pointer';
              fallback.title = '点击查看详情';
              fallback.addEventListener('click', function () { showMediaDetail(row, admin, onReload); });
              td.append(fallback);
            }
          };
          img.addEventListener('click', function () { showMediaDetail(row, admin, onReload); });
          td.append(img);
        } else {
          td.textContent = '—';
        }
      } },
      { label: '类型', fill: function (td, row) { td.textContent = row.asset_type || '—'; } },
      { label: '大小', fill: function (td, row) { td.textContent = formatBytes(row.byte_size); } },
      { label: '时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
    ];
    if (admin) {
      columns.splice(1, 0, { label: '创作者', fill: function (td, row) { td.textContent = person(row); } });
    }
    columns.push({ label: '操作', fill: function (td, row) {
      const box = document.createElement('div');
      box.className = 'actions';

      const viewBtn = document.createElement('button');
      viewBtn.type = 'button';
      viewBtn.textContent = '详情';
      viewBtn.addEventListener('click', function () { showMediaDetail(row, admin, onReload); });
      box.append(viewBtn);

      if (row.cdn_url) {
        const link = document.createElement('a');
        link.href = row.cdn_url;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = '直达';
        link.className = 'btn-line';
        link.style.minHeight = '30px';
        link.style.padding = '0 8px';
        link.style.fontSize = '12px';
        box.append(link);
      }

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = '删除';
      delBtn.addEventListener('click', function () { return deleteMedia(row, onReload); });
      box.append(delBtn);

      td.append(box);
    } });
    fill(id, table(columns, rows));
  }
  async function showMediaDetail(row, admin, onReload) {
    const box = document.createElement('div');
    box.className = 'stack';

    if (row.cdn_url) {
      const isImg = row.asset_type === 'image' || (row.mime_type && row.mime_type.indexOf('image/') === 0);
      const isVid = row.asset_type === 'video' || (row.mime_type && row.mime_type.indexOf('video/') === 0);
      const isAud = row.asset_type === 'audio' || (row.mime_type && row.mime_type.indexOf('audio/') === 0);

      const previewContainer = document.createElement('div');
      previewContainer.style.background = '#0b0f19';
      previewContainer.style.borderRadius = '8px';
      previewContainer.style.padding = '12px';
      previewContainer.style.textAlign = 'center';
      previewContainer.style.marginBottom = '12px';

      if (isImg) {
        const img = document.createElement('img');
        img.src = row.cdn_url;
        img.style.maxWidth = '100%';
        img.style.maxHeight = '360px';
        img.style.objectFit = 'contain';
        img.style.borderRadius = '4px';
        previewContainer.append(img);
      } else if (isVid) {
        const vid = document.createElement('video');
        vid.src = row.cdn_url;
        vid.controls = true;
        vid.style.maxWidth = '100%';
        vid.style.maxHeight = '360px';
        vid.style.borderRadius = '4px';
        previewContainer.append(vid);
      } else if (isAud) {
        const aud = document.createElement('audio');
        aud.src = row.cdn_url;
        aud.controls = true;
        aud.style.width = '100%';
        previewContainer.append(aud);
      }
      box.append(previewContainer);
    }

    function item(label, val) {
      const p = document.createElement('p');
      const b = document.createElement('b');
      b.textContent = label + '：';
      p.append(b, document.createTextNode(val || '—'));
      return p;
    }

    box.append(item('资产编号', row.id));
    if (admin) box.append(item('创作者', person(row)));
    box.append(item('资产类型', row.asset_type));
    box.append(item('文件类型 (MIME)', row.mime_type));
    box.append(item('文件大小', formatBytes(row.byte_size)));
    box.append(item('存储路径', row.storage_key));
    box.append(item('创建时间', formatWhen(row.created_at)));

    if (row.cdn_url) {
      const cdnTitle = document.createElement('p');
      cdnTitle.innerHTML = '<b>CDN 加速直链：</b>';
      const cdnRow = document.createElement('div');
      cdnRow.style.display = 'flex';
      cdnRow.style.gap = '8px';
      cdnRow.style.alignItems = 'center';

      const cdnInput = document.createElement('input');
      cdnInput.readOnly = true;
      cdnInput.value = row.cdn_url;
      cdnInput.style.flex = '1';
      cdnInput.style.fontSize = '12px';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.textContent = '复制直链';
      copyBtn.className = 'btn-line';
      copyBtn.style.padding = '0 12px';
      copyBtn.style.fontSize = '12px';
      copyBtn.addEventListener('click', function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(row.cdn_url).then(function () {
            showAlert('CDN 链接已复制到剪贴板', true);
          }).catch(function () {
            cdnInput.select();
            document.execCommand('copy');
            showAlert('CDN 链接已复制', true);
          });
        } else {
          cdnInput.select();
          document.execCommand('copy');
          showAlert('CDN 链接已复制', true);
        }
      });

      cdnRow.append(cdnInput, copyBtn);
      box.append(cdnTitle, cdnRow);
    }

    await ask({ title: '媒体资产详情', reason: false, extra: box, modalClass: 'modal-lg', confirm: '关闭' });
  }
  async function deleteMedia(row, onReload) {
    const answer = await ask({ title: '移除媒体记录', copy: '从登记簿中移除此媒体索引。', confirm: '确认删除', reason: false });
    if (!answer) return;
    const isAdmin = currentUser && currentUser.role === 'admin';
    const url = isAdmin ? '/api/admin/media/' + row.id : '/api/media/' + row.id;
    const result = await request(url, { method: 'DELETE' });
    if (!result.ok) return showAlert(errorMessage(result, '移除失败'));
    showAlert('媒体记录已移除', true);
    if (onReload) onReload();
  }
  function isAllowedPackageUrl(raw, platform) {
    if (!raw || typeof raw !== 'string') return false;
    let url;
    try { url = new URL(raw, window.location.origin); } catch (_) { return false; }
    if (url.username || url.password || url.hash) return false;
    let pathname = url.pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch (_) { return false; }
    const path = pathname.toLowerCase();
    if (path.includes('..')) return false;
    if (platform === 'windows' && !(path.endsWith('.exe') && path.includes('setup'))) return false;
    if (platform === 'android' && !path.endsWith('.apk')) return false;
    if ((platform === 'macos' || platform === 'linux') && !path.endsWith('.zip')) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'github.com' || host.endsWith('.github.com') || host.endsWith('.githubusercontent.com') || host.includes('looplj')) {
      return false;
    }
    const metaArcHost = host === 'metaarc.com.cn' || host.endsWith('.metaarc.com.cn');
    if (url.protocol === 'https:' && metaArcHost) return true;
    return url.origin === window.location.origin && (url.protocol === 'https:' || url.protocol === 'http:');
  }

  async function loadDownloads() {
    const catalog = await request('/api/updates/catalog');
    const windows = await request('/api/updates/latest?platform=windows&arch=x64');
    const macos = await request('/api/updates/latest?platform=macos&arch=arm64');
    const android = await request('/api/updates/latest?platform=android&arch=arm64');
    const wrap = document.createElement('div');
    const h = document.createElement('h2');
    h.textContent = '发布状态';
    const note = document.createElement('p');
    note.className = 'fine';
    note.textContent = '状态来自更新清单。没有安装包时保持尚未发布，工作台不能改写安装包。';
    wrap.append(h, note);
    const items = [
      ['Windows', windows],
      ['macOS', macos],
      ['Android', android],
    ];
    if (!catalog.ok) {
      const warn = document.createElement('p');
      warn.textContent = '发布清单暂时无法读取。';
      wrap.append(warn);
    }
    items.forEach(function (item) {
      const block = document.createElement('div');
      block.className = 'dl';
      const name = document.createElement('b');
      name.textContent = item[0];
      const detail = document.createElement('p');
      const data = item[1].ok ? item[1].data : null;
      if (!data) detail.textContent = '暂时无法读取';
      else if (data.has_update && data.download_url && isAllowedPackageUrl(data.download_url, item[0].toLowerCase())) {
        detail.textContent = [data.version, data.signed === true ? '已签名' : '未签名', channelLabel(data.channel)].filter(Boolean).join(' · ');
        const link = document.createElement('a');
        link.href = data.download_url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '下载';
        block.append(name, detail, link);
        wrap.append(block);
        return;
      } else detail.textContent = '尚未发布';
      block.append(name, detail);
      wrap.append(block);
    });
    const slot = surface === 'admin' ? 'releases-slot' : 'downloads-slot';
    fill(slot, wrap);
  }
  async function loadSecurity() {
    $('profile-nickname-input').value = currentUser.nickname || '';
    if ($('profile-phone-input')) $('profile-phone-input').value = currentUser.phone || '';
    const logs = await request('/api/auth/login-logs');
    const rows = logs.ok && logs.data && Array.isArray(logs.data.data) ? logs.data.data : null;
    if (!rows) fill('login-logs-slot', empty('登录记录暂时无法读取。'));
    else if (!rows.length) fill('login-logs-slot', empty('还没有登录记录。'));
    else fill('login-logs-slot', table([
      { label: '时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
      { label: '状态', fill: function (td, row) {
        td.innerHTML = row.status === 'success'
          ? '<span class="badge badge-success">登录成功</span>'
          : '<span class="badge badge-danger">验证失败</span>';
      } },
      { label: 'IP 归属地', fill: function (td, row) { td.textContent = [row.ip, row.ip_location].filter(Boolean).join(' · ') || '—'; } },
      { label: '设备/说明', fill: function (td, row) {
        if (row.status !== 'success' && row.fail_reason) {
          td.textContent = row.fail_reason;
        } else if (row.user_agent) {
          td.textContent = simplifyUserAgent(row.user_agent);
        } else {
          td.textContent = '—';
        }
      } },
    ], rows));
    renderKey();
  }
  let keyIsRevealed = false;
  function renderKey() {
    const slot = $('key-slot');
    slot.replaceChildren();
    const key = currentUser.new_api_key || '';
    const masked = key ? (key.length > 12 ? key.slice(0, 7) + '••••••••••••••••' + key.slice(-4) : '••••••••') : '当前没有可展示的密钥';
    const code = document.createElement('code');
    code.textContent = keyIsRevealed ? key : masked;
    code.style.userSelect = 'all';
    code.style.letterSpacing = keyIsRevealed ? 'normal' : '1px';
    const row = document.createElement('div');
    row.className = 'actions';
    if (key) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.textContent = keyIsRevealed ? '隐藏密钥' : '显示密钥';
      toggle.addEventListener('click', function () {
        keyIsRevealed = !keyIsRevealed;
        renderKey();
      });
      row.append(toggle);

      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = '复制';
      copy.addEventListener('click', function () {
        navigator.clipboard.writeText(key).then(function () { showAlert('密钥已复制到剪贴板', true); }).catch(function () { showAlert('复制失败'); });
      });
      row.append(copy);
    }
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = '重置密钥';
    reset.addEventListener('click', resetOwnKey);
    row.append(reset);
    if (key.startsWith('sk-mock-')) {
      const warn = document.createElement('p');
      warn.className = 'fine';
      warn.textContent = '当前为本地离线密钥，点击「重置密钥」可自动接入大模型算力网关。';
      slot.append(code, warn, row);
      return;
    }
    slot.append(code, row);
  }
  async function resetOwnKey() {
    const answer = await ask({ title: '重置客户端密钥', copy: '旧密钥会立即失效，系统将重新在网关为您签发可用密钥。', reason: false, confirm: '确认重置' });
    if (!answer) return;
    const result = await request('/api/auth/reset-api-key', { method: 'POST' });
    if (!result.ok) return showAlert(errorMessage(result, '重置失败'));
    currentUser.new_api_key = result.data.new_api_key || '';
    renderKey();
    showAlert(result.data.message || '密钥已重置', true);
  }
  let userOrderFilter = '';
  let currentUserOrderPage = 1;
  async function loadOrders(page) {
    page = page || 1;
    currentUserOrderPage = page;
    const params = new URLSearchParams();
    if (userOrderFilter.indexOf('status:') === 0) params.set('status', userOrderFilter.slice(7));
    params.set('page', String(page));
    params.set('pageSize', '20');

    const result = await request('/api/auth/orders?' + params.toString());
    const rows = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : null;
    if (!rows) return fill('orders-slot', empty('订单暂时无法读取。'));
    if (!rows.length) {
      fill('orders-slot', empty('暂无符合条件的订单记录。'));
      if ($('user-orders-pages')) renderPagination('user-orders-pages', null);
      return;
    }
    fill('orders-slot', table([
      { label: '订单号', fill: function (td, row) { td.textContent = row.order_no || row.id.slice(0, 8); } },
      { label: '套餐/项目', fill: function (td, row) { td.textContent = row.plan_name || '算力充值'; } },
      { label: '金额', fill: function (td, row) { td.textContent = '¥' + (row.amount_cents / 100).toFixed(2); } },
      { label: '支付渠道', fill: function (td, row) { td.textContent = payChannelLabel(row.pay_channel); } },
      { label: '转账流水号', fill: function (td, row) {
        if (row.pay_trade_no) {
          td.textContent = row.pay_trade_no;
        } else if (row.status === 'pending') {
          const emptySpan = document.createElement('span');
          emptySpan.className = 'fine';
          emptySpan.style.color = '#d97706';
          emptySpan.textContent = '待登记单号';
          td.append(emptySpan);
        } else {
          td.textContent = '—';
        }
      } },
      { label: '状态', fill: function (td, row) {
        td.innerHTML = row.status === 'paid' ? '<span class="badge badge-success">已支付到账</span>' :
                       row.status === 'cancelled' ? '<span class="badge badge-neutral">已取消</span>' :
                       row.status === 'refunded' ? '<span class="badge badge-danger">已退款</span>' :
                       '<span class="badge badge-warning">待核对 / 待到账</span>';
      } },
      { label: '创建时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
      { label: '操作', fill: function (td, row) {
        const box = document.createElement('div');
        box.style.display = 'flex';
        box.style.gap = '6px';
        box.style.flexWrap = 'wrap';

        const detailBtn = document.createElement('button');
        detailBtn.type = 'button';
        detailBtn.className = 'btn-line';
        detailBtn.textContent = row.status === 'pending' ? '转账指引' : '查看详情';
        detailBtn.addEventListener('click', function () {
          showUserOrderDetail(row);
        });
        box.append(detailBtn);

        if (row.status === 'pending') {
          const voucherBtn = document.createElement('button');
          voucherBtn.type = 'button';
          voucherBtn.className = 'btn-line';
          voucherBtn.textContent = row.pay_trade_no ? '修改单号' : '填写转账单号';
          voucherBtn.addEventListener('click', function () {
            submitUserOrderVoucher(row);
          });
          box.append(voucherBtn);

          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.className = 'btn-line';
          cancelBtn.style.color = 'var(--danger, #b42318)';
          cancelBtn.textContent = '取消';
          cancelBtn.addEventListener('click', async function () {
            const answer = await ask({ title: '取消订单', copy: '确定取消订单 ' + (row.order_no || row.id.slice(0, 8)) + ' 吗？', confirm: '确认取消', reason: false });
            if (!answer) return;
            const res = await request('/api/auth/orders/' + row.id + '/cancel', { method: 'POST' });
            if (!res.ok) return showAlert(errorMessage(res, '取消订单失败'));
            showAlert('订单已取消', true);
            loadOrders(currentUserOrderPage);
          });
          box.append(cancelBtn);
        }

        td.append(box);
      } }
    ], rows));

    if ($('user-orders-pages')) {
      renderPagination('user-orders-pages', result.data && result.data.pagination, function (p) {
        loadOrders(p);
      });
    }
  }

  async function showUserOrderDetail(row) {
    const box = document.createElement('div');
    box.style.display = 'grid';
    box.style.gap = '8px';

    function addRow(label, value, isHtml) {
      const line = document.createElement('div');
      line.style.display = 'flex';
      line.style.justifyContent = 'space-between';
      line.style.padding = '6px 0';
      line.style.borderBottom = '1px dashed #f1f5f9';
      const k = document.createElement('span');
      k.className = 'fine';
      k.textContent = label;
      const v = document.createElement('span');
      if (isHtml) v.innerHTML = value;
      else v.textContent = value;
      line.append(k, v);
      box.append(line);
    }

    addRow('订单编号', row.order_no || row.id);
    addRow('套餐项目', row.plan_name || '算力充值');
    addRow('订单金额', '¥' + (row.amount_cents / 100).toFixed(2));
    addRow('包含算力', row.quota_points ? formatNumber(row.quota_points) + ' 点' : '—');
    addRow('支付渠道', payChannelLabel(row.pay_channel));
    addRow('转账/对账单号', row.pay_trade_no || '尚未登记');
    addRow('当前状态', row.status === 'paid' ? '已支付到账' : row.status === 'cancelled' ? '已取消' : '待核对 / 待到账');
    addRow('下单时间', formatWhen(row.created_at));
    if (row.paid_at) addRow('到账时间', formatWhen(row.paid_at));

    const bankBox = document.createElement('div');
    bankBox.style.padding = '12px';
    bankBox.style.background = '#eff6ff';
    bankBox.style.borderRadius = '6px';
    bankBox.style.border = '1px solid #bfdbfe';
    bankBox.style.fontSize = '13px';
    bankBox.style.lineHeight = '1.6';
    bankBox.style.marginTop = '8px';
    bankBox.innerHTML = '<strong>官方对公汇款账户：</strong><br>' +
      '• 户名：北京元弧智能科技有限公司<br>' +
      '• 开户行：招商银行股份有限公司北京分行<br>' +
      '• 账号：<code>1109 4528 8910 801</code><br>' +
      '<span class="fine" style="color:#1e40af">💡 汇款附言请务必填写您的订单号。转账后点击【填写转账单号】提交凭单流水；如需发票请发送开票信息至 contact@metaarc.com.cn</span>';
    box.append(bankBox);

    await ask({
      title: '订单详情与汇款指引',
      extra: box,
      reason: false,
      confirm: '关闭',
    });
  }

  async function submitUserOrderVoucher(row) {
    const box = document.createElement('div');
    box.style.display = 'grid';
    box.style.gap = '8px';

    const tip = document.createElement('p');
    tip.className = 'fine';
    tip.textContent = '请填写银行转账回单号、网银流水号或支付宝/微信支付交易单号，财务核账后将立即为您开通权益。';

    const input = document.createElement('input');
    input.value = row.pay_trade_no || '';
    input.placeholder = '输入转账流水凭据单号';
    input.required = true;
    box.append(tip, input);

    const answer = await ask({
      title: '登记付款流水单号',
      copy: '订单号：' + (row.order_no || row.id.slice(0, 8)),
      extra: box,
      reason: false,
      confirm: '确认提交',
      collect: function () {
        return { payTradeNo: input.value.trim() };
      },
    });
    if (!answer || !answer.payTradeNo) return;

    const res = await request('/api/auth/orders/' + row.id + '/voucher', {
      method: 'POST',
      body: { payTradeNo: answer.payTradeNo },
    });
    if (!res.ok) {
      return showAlert(errorMessage(res, '提交流水号失败'));
    }
    showAlert('转账单号已成功登记，财务核验后将立即为您生效', true);
    loadOrders(currentUserOrderPage);
  }

  async function loadWorkspace() {
    const overview = await request('/api/admin/overview');
    const health = await request('/api/health');
    const status = await request('/api/admin/system-status');
    const wrap = document.createElement('div');
    wrap.className = 'stats';
    function stat(label, value, note) {
      const card = document.createElement('article');
      card.className = 'card stat';
      const span = document.createElement('span');
      span.textContent = label;
      const strong = document.createElement('b');
      strong.textContent = value;
      const em = document.createElement('em');
      em.textContent = note;
      card.append(span, strong, em);
      return card;
    }
    const oData = (overview.ok && overview.data && overview.data.data) || {};
    wrap.append(stat('平台创作者', formatNumber(oData.total_users || 0), '今日新增 +' + (oData.today_new_users || 0)));
    wrap.append(stat('累计营收', '¥' + (oData.total_revenue_yuan || '0.00'), '今日到账 ¥' + (oData.today_revenue_yuan || '0.00')));
    wrap.append(stat('商业订单', formatNumber(oData.total_orders || 0) + ' 笔', '已完成 ' + (oData.paid_orders || 0) + ' 笔'));
    wrap.append(stat('任务调度队列', formatNumber(oData.active_tasks || 0) + ' 个', '排队中与运行中'));
    const mediaBytes = oData.total_media_bytes ? formatBytes(oData.total_media_bytes) : '0 MB';
    wrap.append(stat('云端存储资产', formatNumber(oData.total_media_count || 0) + ' 个', '占用 ' + mediaBytes));
    const dbOk = health.ok && health.data && health.data.db === 'connected';
    const gateway = status.ok && status.data && status.data.data ? status.data.data.ai_gateway : null;
    wrap.append(stat('系统运行状态', dbOk ? '数据库正常' : '数据库异常', '网关：' + gatewayLabel(gateway)));
    $('workspace-stats').replaceChildren(wrap);
    const taskResult = await request('/api/admin/tasks?page=1&pageSize=10');
    renderTasks('workspace-tasks', taskResult, true, function () { loadWorkspace(); });
  }
  async function loadUsers(page) {
    page = page || 1;
    currentUserPage = page;
    const params = new URLSearchParams();
    const keyword = $('user-keyword').value.trim();
    if (keyword) params.set('keyword', keyword);
    if (userFilter.indexOf('plan:') === 0) params.set('plan', userFilter.slice(5));
    if (userFilter.indexOf('status:') === 0) params.set('status', userFilter.slice(7));
    const startDate = $('user-start-date') ? $('user-start-date').value.trim() : '';
    const endDate = $('user-end-date') ? $('user-end-date').value.trim() : '';
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    params.set('page', String(page));
    params.set('pageSize', '20');

    const filterBar = $('user-active-filter-bar');
    const pillText = $('user-filter-pill-text');
    if (filterBar && pillText) {
      if (keyword && (keyword.indexOf('.') !== -1 || keyword.indexOf(':') !== -1 || keyword.indexOf('/') !== -1)) {
        pillText.textContent = 'IP: ' + keyword;
        filterBar.hidden = false;
      } else {
        filterBar.hidden = true;
      }
    }

    const result = await request('/api/admin/users?' + params.toString());
    const rows = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : null;
    if (!rows) return fill('users-slot', empty('用户列表暂时无法读取。'));
    if (!rows.length) {
      fill('users-slot', empty('没有符合条件的用户。'));
      renderPagination('users-pages', null);
      updateBatchBar();
      return;
    }

    fill('users-slot', table([
      {
        label: '选择',
        header: function (th) {
          const masterChk = document.createElement('input');
          masterChk.type = 'checkbox';
          masterChk.title = '全选/取消本页';
          const allSelected = rows.length > 0 && rows.every(function (r) { return selectedUserIds.has(r.id); });
          const someSelected = rows.some(function (r) { return selectedUserIds.has(r.id); });
          masterChk.checked = allSelected;
          masterChk.indeterminate = !allSelected && someSelected;
          masterChk.addEventListener('change', function () {
            rows.forEach(function (r) {
              if (masterChk.checked) selectedUserIds.add(r.id);
              else selectedUserIds.delete(r.id);
            });
            loadUsers(currentUserPage);
          });
          th.append(masterChk);
        },
        fill: function (td, row) {
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.checked = selectedUserIds.has(row.id);
          chk.addEventListener('change', function () {
            if (chk.checked) selectedUserIds.add(row.id);
            else selectedUserIds.delete(row.id);
            updateBatchBar();
          });
          td.append(chk);
        }
      },
      { label: '账号', fill: function (td, row) { td.textContent = person(row); } },
      { label: '邮箱 / 手机', fill: function (td, row) { td.textContent = [row.email, row.phone].filter(Boolean).join(' / ') || '—'; } },
      { label: '注册 / 登录 IP', fill: function (td, row) {
        const ip = row.reg_ip || row.last_login_ip || '—';
        const loc = row.reg_location || row.last_login_location || '';
        const sameCount = row.same_ip_count || 1;
        td.innerHTML = '<span class="badge-ip" title="' + loc + '">' + ip + '</span>' +
          (sameCount > 1 ? ' <span class="badge-same-ip" title="该 IP 关联 ' + sameCount + ' 个账号，点击查看全部" data-filter-ip="' + ip + '">' + sameCount + '同IP</span>' : '');
        const sameBtn = td.querySelector('[data-filter-ip]');
        if (sameBtn) {
          sameBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            $('user-keyword').value = sameBtn.dataset.filterIp;
            loadUsers(1);
          });
        }
      } },
      { label: '套餐', fill: function (td, row) { td.textContent = planName(row.plan); } },
      { label: '角色', fill: function (td, row) { td.textContent = row.role === 'admin' ? '管理员' : '创作者'; } },
      { label: '状态', fill: function (td, row) {
        td.innerHTML = row.status === 'suspended'
          ? '<span class="badge badge-danger">已封禁</span>'
          : '<span class="badge badge-success">正常</span>';
      } },
      { label: '剩余点数', fill: function (td, row) { td.textContent = formatNumber(row.quota); } },
      { label: '操作', fill: function (td, row) { td.append(userActions(row)); } },
    ], rows));

    renderPagination('users-pages', result.data && result.data.pagination, function (p) {
      loadUsers(p);
    });
    updateBatchBar();
  }

  function updateBatchBar() {
    const bar = $('users-batch-bar');
    if (!bar) return;
    if (selectedUserIds.size === 0) {
      bar.hidden = true;
      bar.replaceChildren();
      return;
    }
    bar.hidden = false;
    const title = document.createElement('span');
    title.className = 'batch-title';
    title.textContent = '已选择 ' + selectedUserIds.size + ' 位创作者：';

    const btnSuspend = document.createElement('button');
    btnSuspend.type = 'button';
    btnSuspend.textContent = '批量封禁';
    btnSuspend.addEventListener('click', function () { return batchSetStatus('suspended'); });

    const btnActivate = document.createElement('button');
    btnActivate.type = 'button';
    btnActivate.textContent = '批量解封';
    btnActivate.addEventListener('click', function () { return batchSetStatus('active'); });

    const btnQuota = document.createElement('button');
    btnQuota.type = 'button';
    btnQuota.textContent = '批量调账';
    btnQuota.addEventListener('click', batchAdjustQuota);

    const btnPlan = document.createElement('button');
    btnPlan.type = 'button';
    btnPlan.textContent = '批量套餐';
    btnPlan.addEventListener('click', batchSetPlan);

    const btnClear = document.createElement('button');
    btnClear.type = 'button';
    btnClear.className = 'btn-line';
    btnClear.textContent = '取消选择';
    btnClear.addEventListener('click', function () {
      selectedUserIds.clear();
      updateBatchBar();
      loadUsers(currentUserPage);
    });

    bar.replaceChildren(title, btnSuspend, btnActivate, btnQuota, btnPlan, btnClear);
  }

  async function batchSetStatus(status) {
    const actionLabel = status === 'suspended' ? '批量封禁' : '批量解封';
    const answer = await ask({
      title: actionLabel,
      copy: '确定要将选中的 ' + selectedUserIds.size + ' 位创作者状态更新为 ' + (status === 'suspended' ? '封禁' : '正常') + ' 吗？',
      confirm: '确认' + actionLabel,
    });
    if (!answer) return;
    const result = await request('/api/admin/users/batch', {
      method: 'POST',
      body: {
        userIds: Array.from(selectedUserIds),
        action: 'set_status',
        status: status,
        reason: answer.reason,
      },
    });
    if (!result.ok) return showAlert(errorMessage(result, '批量操作失败'));
    showAlert('已成功更新 ' + (result.data.updatedCount || selectedUserIds.size) + ' 位创作者', true);
    selectedUserIds.clear();
    loadUsers(currentUserPage);
  }

  async function batchSetPlan() {
    const select = document.createElement('select');
    ['free', 'creator', 'pro', 'studio'].forEach(function (slug) {
      const option = document.createElement('option');
      option.value = slug;
      option.textContent = planName(slug);
      select.append(option);
    });
    const answer = await ask({
      title: '批量变更套餐',
      copy: '将选中的 ' + selectedUserIds.size + ' 位创作者套餐标记统一变更。',
      extra: select,
      confirm: '确认变更',
      collect: function () { return { plan: select.value }; },
    });
    if (!answer) return;
    const result = await request('/api/admin/users/batch', {
      method: 'POST',
      body: {
        userIds: Array.from(selectedUserIds),
        action: 'set_plan',
        plan: answer.plan,
        reason: answer.reason,
      },
    });
    if (!result.ok) return showAlert(errorMessage(result, '批量变更失败'));
    showAlert('已成功更新 ' + (result.data.updatedCount || selectedUserIds.size) + ' 位创作者套餐', true);
    selectedUserIds.clear();
    loadUsers(currentUserPage);
  }

  async function batchAdjustQuota() {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '1';
    input.placeholder = '正数增加，负数扣减（如 500 或 -200）';
    const answer = await ask({
      title: '批量调账',
      copy: '为选中的 ' + selectedUserIds.size + ' 位创作者批量调整点数，并将自动同步到大模型算力网关。',
      extra: input,
      confirm: '确认批量调账',
      collect: function () { return { amount: input.value }; },
    });
    if (!answer) return;
    const result = await request('/api/admin/users/batch', {
      method: 'POST',
      body: {
        userIds: Array.from(selectedUserIds),
        action: 'adjust_quota',
        amount: Number(answer.amount),
        reason: answer.reason,
      },
    });
    if (!result.ok) return showAlert(errorMessage(result, '批量调账失败'));
    showAlert('已成功调账 ' + (result.data.updatedCount || selectedUserIds.size) + ' 位创作者', true);
    selectedUserIds.clear();
    loadUsers(currentUserPage);
  }

  function userActions(row) {
    const box = document.createElement('div');
    box.className = 'actions';
    function add(label, handler) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', handler);
      box.append(button);
    }
    add('画像', function () { return showUserDetail(row); });
    add('权限', function () { return changeRole(row); });
    add('套餐', function () { return changePlan(row); });
    add('状态', function () { return changeStatus(row); });
    add('调账', function () { return adjustQuota(row); });
    add('流水', function () { return showUserLedger(row); });
    add('密码', function () { return resetPassword(row); });
    add('密钥', function () { return resetApiKey(row); });
    add('资料', function () { return updateProfile(row); });
    add('日志', function () { return showUserLoginLogs(row); });
    return box;
  }

  async function showUserDetail(row) {
    showAlert('正在获取创作者全貌画像…', true);
    const res = await request('/api/admin/users/' + row.id + '/detail');
    if (!res.ok) return showAlert(errorMessage(res, '无法获取创作者画像'));
    const d = res.data.data;
    const u = d.user;
    const s = d.stats;

    const wrap = document.createElement('div');
    wrap.className = 'stack';

    // 基础信息网格
    const basicSec = document.createElement('div');
    basicSec.className = 'detail-section';
    basicSec.innerHTML = '<h4>基本资料与账号档案</h4>';
    const grid1 = document.createElement('div');
    grid1.className = 'detail-grid';

    function item(title, val) {
      const div = document.createElement('div');
      div.className = 'detail-item';
      const span = document.createElement('span');
      span.textContent = title;
      const b = document.createElement('b');
      b.textContent = val == null || val === '' ? '—' : String(val);
      div.append(span, b);
      return div;
    }

    grid1.append(
      item('用户 ID', u.id),
      item('账号名称', person(u)),
      item('邮箱', u.email || '—'),
      item('手机号', u.phone || '—'),
      item('套餐方案', planName(u.plan)),
      item('账号角色', u.role === 'admin' ? '管理员' : '普通创作者'),
      item('账号状态', u.status === 'suspended' ? '已封禁' : '正常'),
      item('套餐有效期', u.expires_at ? formatWhen(u.expires_at) : '长期有效'),
      item('注册时间', formatWhen(u.created_at)),
      item('最后登录时间', formatWhen(u.last_login_at)),
      item('最后登录 IP', (u.last_login_ip || '—') + (u.last_login_location ? ' (' + u.last_login_location + ')' : '')),
    );
    basicSec.append(grid1);

    // 权益与算力网关状态
    const quotaSec = document.createElement('div');
    quotaSec.className = 'detail-section';
    quotaSec.innerHTML = '<h4>算力与大模型网关探测</h4>';
    const grid2 = document.createElement('div');
    grid2.className = 'detail-grid';
    grid2.append(
      item('本地剩余点数', formatNumber(u.quota)),
      item('累计发放点数', formatNumber(u.total_quota)),
      item('累计订单消费', '¥ ' + (s.total_spent_yuan || '0.00') + ' (' + (s.paid_orders_count || 0) + ' 笔)'),
      item('New-API 用户 ID', u.new_api_user_id ? String(u.new_api_user_id) : '未绑定 (自愈待机)'),
      item('网关实时探测点数', d.liveNewApi ? formatNumber(d.liveNewApi.quota) : (u.new_api_user_id ? '探测失败/无响应' : '未连接网关')),
      item('网关累计消耗点数', d.liveNewApi ? formatNumber(d.liveNewApi.used_quota) : '—'),
    );
    quotaSec.append(grid2);

    // 最近 5 笔订单
    const orderSec = document.createElement('div');
    orderSec.className = 'detail-section';
    orderSec.innerHTML = '<h4>最近 5 笔订单记录</h4>';
    if (!d.recentOrders || !d.recentOrders.length) {
      orderSec.append(empty('暂无订单记录'));
    } else {
      orderSec.append(table([
        { label: '订单号', fill: function (td, r) { td.textContent = r.order_no; } },
        { label: '套餐/项目', fill: function (td, r) { td.textContent = r.plan_name || '自定义'; } },
        { label: '金额', fill: function (td, r) { td.textContent = '¥' + (r.amount_cents / 100).toFixed(2); } },
        { label: '状态', fill: function (td, r) {
          td.innerHTML = r.status === 'paid' ? '<span class="badge badge-success">已支付</span>' :
                         r.status === 'cancelled' ? '<span class="badge badge-neutral">已取消</span>' :
                         '<span class="badge badge-warning">待支付</span>';
        } },
        { label: '下单时间', fill: function (td, r) { td.textContent = formatWhen(r.created_at); } },
      ], d.recentOrders));
    }

    // 最近 5 个任务
    const taskSec = document.createElement('div');
    taskSec.className = 'detail-section';
    taskSec.innerHTML = '<h4>最近 5 个创作任务</h4>';
    if (!d.recentTasks || !d.recentTasks.length) {
      taskSec.append(empty('暂无创作任务'));
    } else {
      taskSec.append(table([
        { label: '类型', fill: function (td, r) { td.textContent = r.task_type || r.type || '—'; } },
        { label: '提示词/内容', fill: function (td, r) { td.textContent = (r.prompt || '—').slice(0, 30); } },
        { label: '状态', fill: function (td, r) {
          td.innerHTML = r.status === 'completed' ? '<span class="badge badge-success">完成</span>' :
                         r.status === 'failed' ? '<span class="badge badge-danger">失败</span>' :
                         '<span class="badge badge-warning">' + r.status + '</span>';
        } },
        { label: '执行耗时', fill: function (td, r) { td.textContent = r.duration_ms ? (r.duration_ms + 'ms') : '—'; } },
        { label: '创建时间', fill: function (td, r) { td.textContent = formatWhen(r.created_at); } },
      ], d.recentTasks));
    }

    // 最近 5 次登录记录
    const loginSec = document.createElement('div');
    loginSec.className = 'detail-section';
    loginSec.innerHTML = '<h4>最近 5 次安全登录记录</h4>';
    if (!d.recentLogins || !d.recentLogins.length) {
      loginSec.append(empty('暂无登录记录'));
    } else {
      loginSec.append(table([
        { label: '时间', fill: function (td, r) { td.textContent = formatWhen(r.created_at); } },
        { label: 'IP / 归属地', fill: function (td, r) { td.textContent = (r.ip || '—') + (r.ip_location ? ' · ' + r.ip_location : ''); } },
        { label: '状态', fill: function (td, r) {
          td.innerHTML = r.status === 'success' ? '<span class="badge badge-success">成功</span>' : '<span class="badge badge-danger">失败</span>';
        } },
        { label: '终端', fill: function (td, r) { td.textContent = (r.user_agent || '—').slice(0, 32); } },
      ], d.recentLogins));
    }

    // 快捷操作栏
    const actSec = document.createElement('div');
    actSec.className = 'detail-section';
    actSec.innerHTML = '<h4>快捷管理操作</h4>';
    const actBox = document.createElement('div');
    actBox.className = 'actions';
    function makeBtn(text, handler) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-line';
      b.textContent = text;
      b.style.marginRight = '8px';
      b.addEventListener('click', async function () {
        $('modal-cancel').click();
        await handler(row);
      });
      actBox.append(b);
    }
    makeBtn('调整点数', adjustQuota);
    makeBtn('修改套餐', changePlan);
    makeBtn('切换状态', changeStatus);
    makeBtn('重置密码', resetPassword);
    makeBtn('轮换密钥', resetApiKey);
    makeBtn('查看全部流水', showUserLedger);
    actSec.append(actBox);

    wrap.append(basicSec, quotaSec, orderSec, taskSec, loginSec, actSec);

    await ask({
      title: '创作者 360° 全貌画像 — ' + person(u),
      extra: wrap,
      reason: false,
      confirm: '关闭',
      modalClass: 'modal-lg',
    });
  }

  async function resetPassword(row) {
    const answer = await ask({
      title: '重置登录密码',
      copy: '系统将为 ' + person(row) + ' 生成一个高强度随机初始密码，并立即吊销其现有的所有网页登录会话。',
      confirm: '确认重置',
    });
    if (!answer) return;
    const result = await request('/api/admin/users/' + row.id + '/reset-password', {
      method: 'POST',
      body: { reason: answer.reason },
    });
    if (!result.ok) return showAlert(errorMessage(result, '密码重置失败'));
    const tempPassword = result.data && result.data.tempPassword;
    const box = document.createElement('div');
    box.className = 'stack';
    const p = document.createElement('p');
    p.textContent = '新随机密码如下，请复制并发给用户（关闭后无法再次查看明文）：';
    const code = document.createElement('code');
    code.style.fontSize = '16px';
    code.style.padding = '8px 12px';
    code.style.background = '#f0f4f8';
    code.style.borderRadius = '6px';
    code.style.display = 'block';
    code.style.userSelect = 'all';
    code.textContent = tempPassword || '—';
    box.append(p, code);
    await ask({ title: '密码已重置', reason: false, extra: box, confirm: '我已复制保存' });
  }

  async function resetApiKey(row) {
    const answer = await ask({
      title: '轮换重置算力 Key',
      copy: '重置后，原算力 Key 立即作废，系统将为 ' + person(row) + ' 在网关签发全新的 Key。',
      confirm: '确认重置',
    });
    if (!answer) return;
    const result = await request('/api/admin/users/' + row.id + '/reset-api-key', {
      method: 'POST',
      body: { reason: answer.reason },
    });
    if (!result.ok) return showAlert(errorMessage(result, '重置 Key 失败'));
    const newKey = result.data && result.data.apiKey;
    const box = document.createElement('div');
    box.className = 'stack';
    const p = document.createElement('p');
    p.textContent = '新算力 Key 已成功签发：';
    const code = document.createElement('code');
    code.style.fontSize = '14px';
    code.style.padding = '8px 12px';
    code.style.background = '#f0f4f8';
    code.style.borderRadius = '6px';
    code.style.display = 'block';
    code.style.userSelect = 'all';
    code.textContent = newKey || '—';
    box.append(p, code);
    await ask({ title: 'Key 轮换成功', reason: false, extra: box, confirm: '关闭' });
    loadUsers(currentUserPage);
  }

  async function updateProfile(row) {
    const box = document.createElement('div');
    box.className = 'stack';
    const nickLabel = document.createElement('label');
    nickLabel.textContent = '昵称';
    const nickInput = document.createElement('input');
    nickInput.type = 'text';
    nickInput.value = row.nickname || '';
    const emailLabel = document.createElement('label');
    emailLabel.textContent = '邮箱';
    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.value = row.email || '';
    const phoneLabel = document.createElement('label');
    phoneLabel.textContent = '手机号';
    const phoneInput = document.createElement('input');
    phoneInput.type = 'tel';
    phoneInput.value = row.phone || '';
    box.append(nickLabel, nickInput, emailLabel, emailInput, phoneLabel, phoneInput);
    const answer = await ask({
      title: '修改用户资料',
      copy: '修改 ' + person(row) + ' 的基本账号绑定信息。',
      extra: box,
      reason: false,
      confirm: '保存修改',
      collect: function () {
        return {
          nickname: nickInput.value.trim(),
          email: emailInput.value.trim(),
          phone: phoneInput.value.trim(),
        };
      },
    });
    if (!answer) return;
    const result = await request('/api/admin/users/' + row.id + '/update-profile', {
      method: 'POST',
      body: answer,
    });
    if (!result.ok) return showAlert(errorMessage(result, '保存资料失败'));
    showAlert('用户资料已更新', true);
    loadUsers(currentUserPage);
  }

  async function showUserLoginLogs(row) {
    const result = await request('/api/admin/users/' + row.id + '/login-logs');
    const rows = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : [];
    const box = document.createElement('div');
    if (!rows.length) box.append(empty('该账号暂无登录日志。'));
    else box.append(table([
      { label: '时间', fill: function (td, item) { td.textContent = formatWhen(item.created_at); } },
      { label: '状态', fill: function (td, item) {
        td.innerHTML = item.status === 'success'
          ? '<span class="badge badge-success">成功</span>'
          : '<span class="badge badge-danger">失败</span>';
      } },
      { label: 'IP', fill: function (td, item) { td.textContent = item.ip || '—'; } },
      { label: '地点/说明', fill: function (td, item) { td.textContent = item.ip_location || item.fail_reason || '—'; } },
    ], rows));
    await ask({ title: person(row) + ' 的登录日志', reason: false, extra: box, confirm: '关闭' });
  }

  async function changeRole(row) {
    const next = row.role === 'admin' ? 'user' : 'admin';
    const answer = await ask({
      title: next === 'admin' ? '设为管理员' : '取消管理员',
      copy: (person(row)) + ' 目前是' + (row.role === 'admin' ? '管理员' : '创作者') + '。管理员可以查看用户、调整套餐和点数。此操作不能降级你自己。',
      confirm: '确认变更',
    });
    if (!answer) return;
    const result = await request('/api/admin/users/' + row.id + '/set-role', { method: 'POST', body: { role: next, reason: answer.reason } });
    if (!result.ok) return showAlert(errorMessage(result, '变更失败'));
    showAlert('权限已更新', true);
    loadUsers(currentUserPage);
  }

  async function changePlan(row) {
    const extra = document.createElement('select');
    ['free', 'creator', 'pro', 'studio'].forEach(function (slug) {
      const option = document.createElement('option');
      option.value = slug;
      option.textContent = planName(slug);
      option.selected = slug === row.plan;
      extra.append(option);
    });
    const answer = await ask({ title: '调整套餐', copy: '只改账号上的套餐标记，不会创建订单。', extra: extra, confirm: '确认变更', collect: function () { return { plan: extra.value }; } });
    if (!answer) return;
    const result = await request('/api/admin/users/' + row.id + '/set-plan', { method: 'POST', body: { plan: answer.plan, reason: answer.reason } });
    if (!result.ok) return showAlert(errorMessage(result, '套餐变更失败'));
    showAlert('套餐已更新', true);
    loadUsers(currentUserPage);
  }

  async function changeStatus(row) {
    const next = row.status === 'suspended' ? 'active' : 'suspended';
    const answer = await ask({
      title: next === 'suspended' ? '封禁账号' : '恢复账号',
      copy: next === 'suspended' ? '封禁后，该账号不能登录。不能封禁当前管理员自己。' : '恢复后，该账号可以重新登录。',
      confirm: '确认变更',
    });
    if (!answer) return;
    const result = await request('/api/admin/users/' + row.id + '/set-status', { method: 'POST', body: { status: next, reason: answer.reason } });
    if (!result.ok) return showAlert(errorMessage(result, '状态变更失败'));
    showAlert('状态已更新', true);
    loadUsers(currentUserPage);
  }

  async function adjustQuota(row) {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '1';
    input.placeholder = '正数增加，负数扣减';
    const answer = await ask({ title: '调整点数', copy: person(row) + ' 当前剩余 ' + formatNumber(row.quota) + '。将同步至 AI 网关。', extra: input, confirm: '确认调账', collect: function () { return { amount: input.value }; } });
    if (!answer) return;
    const result = await request('/api/admin/users/' + row.id + '/adjust-quota', { method: 'POST', body: { amount: Number(answer.amount), reason: answer.reason } });
    if (!result.ok) return showAlert(errorMessage(result, '调账失败'));
    showAlert('点数已调整并同步', true);
    loadUsers(currentUserPage);
  }

  async function showUserLedger(row) {
    const result = await request('/api/admin/users/' + row.id + '/quota-logs');
    const rows = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : [];
    const box = document.createElement('div');
    if (!rows.length) box.append(empty('这个账号还没有点数流水。'));
    else box.append(table([
      { label: '时间', fill: function (td, item) { td.textContent = formatWhen(item.created_at); } },
      { label: '点数', fill: function (td, item) { td.textContent = formatNumber(item.amount); } },
      { label: '余额', fill: function (td, item) { td.textContent = formatNumber(item.balance_after); } },
      { label: '备注', fill: function (td, item) { td.textContent = item.remark || '—'; } },
    ], rows));
    await ask({ title: person(row) + ' 的流水', reason: false, extra: box, confirm: '关闭' });
  }

  async function createUser() {
    const email = document.createElement('input');
    email.type = 'email';
    email.placeholder = '邮箱';
    email.required = true;
    const password = document.createElement('input');
    password.type = 'text';
    password.placeholder = '初始密码，至少 6 位';
    password.required = true;
    const nickname = document.createElement('input');
    nickname.placeholder = '昵称，可选';
    const phone = document.createElement('input');
    phone.placeholder = '手机号，可选';
    const box = document.createElement('div');
    box.className = 'stack';
    box.append(email, password, nickname, phone);
    const answer = await ask({
      title: '新建创作者账号',
      copy: '系统将创建用户并在 AI 算力网关签发专属 Key，自动注入体验点数。',
      extra: box,
      confirm: '立即创建',
      collect: function () {
        return {
          email: email.value.trim(),
          password: password.value,
          nickname: nickname.value.trim(),
          phone: phone.value.trim(),
        };
      },
    });
    if (!answer) return;
    const result = await request('/api/admin/users/create', { method: 'POST', body: { email: answer.email, password: answer.password, nickname: answer.nickname, phone: answer.phone, reason: answer.reason } });
    if (!result.ok) return showAlert(errorMessage(result, '创建失败'));
    showAlert('账号已创建并完成 AI 网关接入', true);
    loadUsers(currentUserPage);
  }

  // --- 套餐配置与管理 ---
  async function loadAdminPlans() {
    const result = await request('/api/admin/plans');
    const rows = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : null;
    if (!rows) return fill('plans-slot', empty('套餐暂时无法读取。'));
    fill('plans-slot', table([
      { label: '名称', fill: function (td, row) { td.textContent = row.name || '—'; } },
      { label: '标识 (slug)', fill: function (td, row) { td.textContent = row.slug || row.id; } },
      { label: '价格', fill: function (td, row) { td.textContent = '¥' + (row.price_cents / 100).toFixed(2); } },
      { label: '算力点数', fill: function (td, row) { td.textContent = formatNumber(row.quota_points); } },
      { label: '时长', fill: function (td, row) { td.textContent = (row.duration_days || 30) + '天'; } },
      { label: '状态', fill: function (td, row) {
        td.innerHTML = row.is_active
          ? '<span class="badge badge-success">上架中</span>'
          : '<span class="badge badge-neutral">已下架</span>';
      } },
      { label: '排序', fill: function (td, row) { td.textContent = String(row.sort_order ?? 0); } },
      { label: '付费订单', fill: function (td, row) { td.textContent = (row.paid_orders || 0) + ' 笔'; } },
      { label: '操作', fill: function (td, row) {
        const box = document.createElement('div');
        box.className = 'actions';
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.textContent = '编辑';
        editBtn.addEventListener('click', function () { return openPlanEditor(row); });
        box.append(editBtn);

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = row.is_active ? '下架' : '上架';
        toggleBtn.addEventListener('click', function () { return togglePlan(row); });
        box.append(toggleBtn);
        td.append(box);
      } },
    ], rows));
  }

  async function openPlanEditor(row) {
    const box = document.createElement('div');
    box.className = 'stack';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = '套餐名称';
    const nameInput = document.createElement('input');
    nameInput.value = row.name || '';
    const priceLabel = document.createElement('label');
    priceLabel.textContent = '售价（元）';
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.step = '0.01';
    priceInput.value = (row.price_cents / 100).toFixed(2);
    const quotaLabel = document.createElement('label');
    quotaLabel.textContent = '包含算力点数';
    const quotaInput = document.createElement('input');
    quotaInput.type = 'number';
    quotaInput.value = row.quota_points || 0;
    const sortLabel = document.createElement('label');
    sortLabel.textContent = '排序权重（小排在前）';
    const sortInput = document.createElement('input');
    sortInput.type = 'number';
    sortInput.value = row.sort_order || 0;

    box.append(nameLabel, nameInput, priceLabel, priceInput, quotaLabel, quotaInput, sortLabel, sortInput);
    const answer = await ask({
      title: '编辑套餐「' + row.name + '」',
      extra: box,
      confirm: '保存配置',
      collect: function () {
        return {
          name: nameInput.value.trim(),
          priceCents: Math.round(parseFloat(priceInput.value || 0) * 100),
          quotaPoints: parseFloat(quotaInput.value || 0),
          sortOrder: parseInt(sortInput.value || 0, 10),
        };
      },
    });
    if (!answer) return;
    const result = await request('/api/admin/plans/' + encodeURIComponent(row.id) + '/update', {
      method: 'POST',
      body: {
        name: answer.name,
        priceCents: answer.priceCents,
        quotaPoints: answer.quotaPoints,
        sortOrder: answer.sortOrder,
        reason: answer.reason,
      },
    });
    if (!result.ok) return showAlert(errorMessage(result, '保存失败'));
    showAlert('套餐已更新', true);
    loadAdminPlans();
  }

  async function createPlanModal() {
    const box = document.createElement('div');
    box.className = 'stack';
    const idInput = document.createElement('input');
    idInput.placeholder = '套餐 ID (唯一英文标识，如 creator_plus)';
    const nameInput = document.createElement('input');
    nameInput.placeholder = '套餐名称 (如 创作者特惠版)';
    const slugInput = document.createElement('input');
    slugInput.placeholder = '套餐 Slug (如 creator_plus)';
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.placeholder = '售价（元，如 29）';
    const quotaInput = document.createElement('input');
    quotaInput.type = 'number';
    quotaInput.placeholder = '赠送算力点数 (如 1000)';

    box.append(idInput, nameInput, slugInput, priceInput, quotaInput);
    const answer = await ask({
      title: '新建套餐',
      extra: box,
      confirm: '确认创建',
      collect: function () {
        return {
          id: idInput.value.trim(),
          name: nameInput.value.trim(),
          slug: slugInput.value.trim(),
          priceCents: Math.round(parseFloat(priceInput.value || 0) * 100),
          quotaPoints: parseFloat(quotaInput.value || 0),
        };
      },
    });
    if (!answer) return;
    const result = await request('/api/admin/plans/create', {
      method: 'POST',
      body: {
        id: answer.id,
        name: answer.name,
        slug: answer.slug,
        priceCents: answer.priceCents,
        quotaPoints: answer.quotaPoints,
        reason: answer.reason,
      },
    });
    if (!result.ok) return showAlert(errorMessage(result, '创建套餐失败'));
    showAlert('套餐已创建', true);
    loadAdminPlans();
  }

  async function togglePlan(row) {
    const answer = await ask({ title: row.is_active ? '下架套餐' : '上架套餐', copy: '这只改变官网是否展示，不会产生付款。', confirm: '确认变更' });
    if (!answer) return;
    const result = await request('/api/admin/plans/' + encodeURIComponent(row.id) + '/toggle', { method: 'POST', body: { reason: answer.reason } });
    if (!result.ok) return showAlert(errorMessage(result, '操作失败'));
    showAlert(result.data.message || '已更新', true);
    loadAdminPlans();
  }

  // --- 订单管理模块 ---
  function orderStatusBadge(status) {
    if (status === 'paid') return '<span class="badge badge-success">已完成</span>';
    if (status === 'pending') return '<span class="badge badge-warning">待支付</span>';
    if (status === 'cancelled') return '<span class="badge badge-neutral">已取消</span>';
    if (status === 'refunded') return '<span class="badge badge-danger">已退款</span>';
    return '<span class="badge badge-neutral">' + (status || '—') + '</span>';
  }

  async function loadAdminOrders(page) {
    page = page || 1;
    currentOrderPage = page;
    const params = new URLSearchParams();
    const keyword = $('order-keyword') ? $('order-keyword').value.trim() : '';
    if (keyword) params.set('keyword', keyword);
    if (orderFilter.indexOf('status:') === 0) params.set('status', orderFilter.slice(7));
    const startDate = $('order-start-date') ? $('order-start-date').value.trim() : '';
    const endDate = $('order-end-date') ? $('order-end-date').value.trim() : '';
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    params.set('page', String(page));
    params.set('pageSize', '20');

    const result = await request('/api/admin/orders?' + params.toString());
    const rows = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : null;
    if (!rows) return fill('admin-orders-slot', empty('订单记录暂时无法读取。'));
    if (!rows.length) {
      fill('admin-orders-slot', empty('暂无符合条件的订单记录。'));
      renderPagination('admin-orders-pages', null);
      return;
    }

    fill('admin-orders-slot', table([
      { label: '订单号', fill: function (td, row) { td.textContent = row.order_no || row.id.slice(0, 8); } },
      { label: '创作者', fill: function (td, row) { td.textContent = person(row); } },
      { label: '套餐/项目', fill: function (td, row) { td.textContent = row.plan_name || '算力充值'; } },
      { label: '金额', fill: function (td, row) { td.textContent = '¥' + (row.amount_cents / 100).toFixed(2); } },
      { label: '渠道', fill: function (td, row) { td.textContent = payChannelLabel(row.pay_channel); } },
      { label: '外部流水号', fill: function (td, row) { td.textContent = row.pay_trade_no || '—'; } },
      { label: '状态', fill: function (td, row) { td.innerHTML = orderStatusBadge(row.status); } },
      { label: '下单时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
      { label: '到账时间', fill: function (td, row) { td.textContent = formatWhen(row.paid_at); } },
      { label: '操作', fill: function (td, row) {
        const box = document.createElement('div');
        box.className = 'actions';

        const detailBtn = document.createElement('button');
        detailBtn.type = 'button';
        detailBtn.textContent = '详情';
        detailBtn.addEventListener('click', function () { return showOrderDetail(row); });
        box.append(detailBtn);

        if (row.status === 'pending') {
          const payBtn = document.createElement('button');
          payBtn.type = 'button';
          payBtn.textContent = '确认到账';
          payBtn.addEventListener('click', function () { return markOrderPaid(row); });
          box.append(payBtn);

          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.textContent = '作废';
          cancelBtn.addEventListener('click', function () { return cancelOrder(row); });
          box.append(cancelBtn);
        }

        if (row.status === 'paid') {
          const refundBtn = document.createElement('button');
          refundBtn.type = 'button';
          refundBtn.textContent = '退款冲正';
          refundBtn.addEventListener('click', function () { return refundOrder(row); });
          box.append(refundBtn);
        }

        td.append(box);
      } },
    ], rows));

    renderPagination('admin-orders-pages', result.data && result.data.pagination, function (p) {
      loadAdminOrders(p);
    });
  }

  async function showOrderDetail(row) {
    const res = await request('/api/admin/orders/' + row.id);
    if (!res.ok || !res.data || !res.data.data) {
      return showAlert(errorMessage(res, '无法加载订单详情'));
    }
    const d = res.data.data;
    const o = d.order || row;

    const wrap = document.createElement('div');
    wrap.className = 'stack';

    function addRow(label, val, isHtml) {
      const p = document.createElement('p');
      const b = document.createElement('b');
      b.textContent = label + '：';
      p.append(b);
      if (isHtml) {
        const span = document.createElement('span');
        span.innerHTML = val;
        p.append(span);
      } else {
        p.append(document.createTextNode(val ?? '—'));
      }
      wrap.append(p);
    }

    addRow('订单编号', o.order_no || o.id);
    addRow('创作者账号', person(o));
    addRow('下单金额', '¥' + (o.amount_cents / 100).toFixed(2));
    addRow('购买套餐/项目', o.plan_name ? o.plan_name + ' (包含 ' + formatNumber(o.quota_points) + ' 点算力)' : '算力充值');
    addRow('支付渠道', payChannelLabel(o.pay_channel));
    addRow('外部流水号', o.pay_trade_no || '—');
    addRow('当前状态', orderStatusBadge(o.status), true);
    addRow('下单时间', formatWhen(o.created_at));
    addRow('支付时间', formatWhen(o.paid_at));

    if (Array.isArray(d.quota_transactions) && d.quota_transactions.length > 0) {
      const qTitle = document.createElement('h3');
      qTitle.style.margin = '16px 0 8px 0';
      qTitle.textContent = '关联算力流水台账';
      wrap.append(qTitle);
      const qTable = table([
        { label: '流水类型', fill: function (td, q) { td.textContent = q.type; } },
        { label: '变动点数', fill: function (td, q) { td.textContent = (q.amount > 0 ? '+' : '') + formatNumber(q.amount); } },
        { label: '变动后结存', fill: function (td, q) { td.textContent = formatNumber(q.balance_after); } },
        { label: '备注说明', fill: function (td, q) { td.textContent = q.remark || '—'; } },
        { label: '记录时间', fill: function (td, q) { td.textContent = formatWhen(q.created_at); } },
      ], d.quota_transactions);
      wrap.append(qTable);
    }

    if (Array.isArray(d.audit_logs) && d.audit_logs.length > 0) {
      const aTitle = document.createElement('h3');
      aTitle.style.margin = '16px 0 8px 0';
      aTitle.textContent = '订单管理审计记录';
      wrap.append(aTitle);
      const aTable = table([
        { label: '操作人', fill: function (td, a) { td.textContent = a.actor_nickname || a.actor_email || '管理员'; } },
        { label: '动作', fill: function (td, a) { td.textContent = a.action; } },
        { label: '原因', fill: function (td, a) { td.textContent = a.reason || '—'; } },
        { label: '操作时间', fill: function (td, a) { td.textContent = formatWhen(a.created_at); } },
      ], d.audit_logs);
      wrap.append(aTable);
    }

    await ask({
      title: '订单详情 · ' + (o.order_no || o.id.slice(0, 8)),
      reason: false,
      extra: wrap,
      modalClass: 'modal-lg',
      confirm: '关闭',
    });
  }

  async function refundOrder(row) {
    const extraWrap = document.createElement('div');
    extraWrap.style.margin = '10px 0';

    const chkLabel = document.createElement('label');
    chkLabel.style.display = 'flex';
    chkLabel.style.alignItems = 'center';
    chkLabel.style.gap = '8px';
    chkLabel.style.cursor = 'pointer';

    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = true;

    const span = document.createElement('span');
    span.textContent = '同步扣减该订单发放的 ' + formatNumber(row.quota_points || 0) + ' 点算力及 AI 网关配额';

    chkLabel.append(chk, span);
    extraWrap.append(chkLabel);

    const answer = await ask({
      title: '订单退款冲正处理',
      copy: '确认对订单 ' + (row.order_no || row.id.slice(0, 8)) + ' (¥' + (row.amount_cents / 100).toFixed(2) + ') 办理退款。订单状态将变更为「已退款」。',
      extra: extraWrap,
      confirm: '确认退款冲正',
      collect: function () {
        return { refundPoints: chk.checked };
      },
    });
    if (!answer) return;

    const result = await request('/api/admin/orders/' + row.id + '/refund', {
      method: 'POST',
      body: {
        reason: answer.reason,
        refundPoints: answer.refundPoints,
      },
    });
    if (!result.ok) return showAlert(errorMessage(result, '订单退款冲正失败'));
    showAlert('订单已成功办理退款冲正', true);
    loadAdminOrders(currentOrderPage);
  }

  async function markOrderPaid(row) {
    const input = document.createElement('input');
    input.placeholder = '外部转账流水号 (可选)';
    const answer = await ask({
      title: '确认订单已到账',
      copy: '确认该笔款项已通过线下对账到账。系统将立即为 ' + person(row) + ' 提升套餐权益、充值算力并同步到 AI 网关。',
      extra: input,
      confirm: '确认到账并充值',
      collect: function () { return { payTradeNo: input.value.trim() }; },
    });
    if (!answer) return;
    const result = await request('/api/admin/orders/' + row.id + '/mark-paid', {
      method: 'POST',
      body: {
        payTradeNo: answer.payTradeNo,
        reason: answer.reason,
      },
    });
    if (!result.ok) return showAlert(errorMessage(result, '确认订单失败'));
    showAlert('订单已标记为已支付，点数已到账', true);
    loadAdminOrders(currentOrderPage);
  }

  async function cancelOrder(row) {
    const answer = await ask({
      title: '作废订单',
      copy: '作废待支付订单后，该订单不能再标记已付款。',
      confirm: '确认作废',
    });
    if (!answer) return;
    const result = await request('/api/admin/orders/' + row.id + '/cancel', {
      method: 'POST',
      body: { reason: answer.reason },
    });
    if (!result.ok) return showAlert(errorMessage(result, '作废失败'));
    showAlert('订单已作废', true);
    loadAdminOrders(currentOrderPage);
  }

  async function createManualOrder() {
    const box = document.createElement('div');
    box.className = 'stack';

    const userLabel = document.createElement('label');
    userLabel.textContent = '用户 UUID 或用户完整邮箱/手机';
    const userInput = document.createElement('input');
    userInput.placeholder = '输入用户 ID 或账号';
    userInput.required = true;

    const planLabel = document.createElement('label');
    planLabel.textContent = '套餐选项';
    const planSelect = document.createElement('select');
    const customOpt = document.createElement('option');
    customOpt.value = '';
    customOpt.textContent = '自定义金额与点数';
    planSelect.append(customOpt);
    plans.forEach(function (p) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + ' (¥' + (p.price_cents / 100).toFixed(2) + ' / ' + p.quota_points + '点)';
      planSelect.append(opt);
    });

    const amountLabel = document.createElement('label');
    amountLabel.textContent = '订单金额（元）';
    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.step = '0.01';
    amountInput.value = '99.00';

    const pointsLabel = document.createElement('label');
    pointsLabel.textContent = '包含算力点数';
    const pointsInput = document.createElement('input');
    pointsInput.type = 'number';
    pointsInput.value = '5000';

    planSelect.addEventListener('change', function () {
      const selected = plans.find(function (p) { return p.id === planSelect.value; });
      if (selected) {
        amountInput.value = (selected.price_cents / 100).toFixed(2);
        pointsInput.value = selected.quota_points;
      }
    });

    const channelLabelEl = document.createElement('label');
    channelLabelEl.textContent = '收款渠道';
    const channelSelect = document.createElement('select');
    [
      ['offline_alipay', '支付宝线下对账'],
      ['offline_wechat', '微信线下对账'],
      ['bank_transfer', '对公/银行转账'],
      ['admin_comp', '管理员特批赠送'],
    ].forEach(function (pair) {
      const opt = document.createElement('option');
      opt.value = pair[0];
      opt.textContent = pair[1];
      channelSelect.append(opt);
    });

    const tradeNoInput = document.createElement('input');
    tradeNoInput.placeholder = '线下交易流水号 (选填)';

    const markPaidWrap = document.createElement('label');
    markPaidWrap.style.display = 'flex';
    markPaidWrap.style.alignItems = 'center';
    markPaidWrap.style.gap = '8px';
    markPaidWrap.style.marginTop = '8px';
    const markPaidChk = document.createElement('input');
    markPaidChk.type = 'checkbox';
    markPaidChk.checked = true;
    markPaidChk.style.width = 'auto';
    markPaidChk.style.minHeight = 'auto';
    markPaidWrap.append(markPaidChk, document.createTextNode('直接确认到账并立即发点（同步 AI 网关）'));

    box.append(userLabel, userInput, planLabel, planSelect, amountLabel, amountInput, pointsLabel, pointsInput, channelLabelEl, channelSelect, tradeNoInput, markPaidWrap);

    const answer = await ask({
      title: '线下手工录单',
      copy: '为指定用户创建线下订单。如果勾选立即发点，系统将自动充值到本地及上游大模型网关。',
      extra: box,
      confirm: '确认录入',
      collect: function () {
        return {
          userTarget: userInput.value.trim(),
          planId: planSelect.value || undefined,
          amountCents: Math.round(parseFloat(amountInput.value || 0) * 100),
          quotaPoints: parseFloat(pointsInput.value || 0),
          payChannel: channelSelect.value,
          payTradeNo: tradeNoInput.value.trim() || undefined,
          markPaid: markPaidChk.checked,
        };
      },
    });
    if (!answer) return;

    let targetUserId = answer.userTarget;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
      const uRes = await request('/api/admin/users?keyword=' + encodeURIComponent(targetUserId) + '&pageSize=1');
      if (uRes.ok && uRes.data && Array.isArray(uRes.data.data) && uRes.data.data.length > 0) {
        targetUserId = uRes.data.data[0].id;
      } else {
        return showAlert('未找到对应账号的用户 ID，请输入精确邮箱或用户 UUID');
      }
    }

    const result = await request('/api/admin/orders/create', {
      method: 'POST',
      body: {
        userId: targetUserId,
        planId: answer.planId,
        amountCents: answer.amountCents,
        quotaPoints: answer.quotaPoints,
        payChannel: answer.payChannel,
        payTradeNo: answer.payTradeNo,
        markPaid: answer.markPaid,
        reason: answer.reason,
      },
    });
    if (!result.ok) return showAlert(errorMessage(result, '录单失败'));
    showAlert('订单录入成功' + (answer.markPaid ? '，点数已到账' : ''), true);
    loadAdminOrders(1);
  }

  async function cleanupExpiredOrders() {
    const answer = await ask({
      title: '清理超时未支付订单',
      copy: '系统将扫描超过 24 小时未支付的待处理 (pending) 订单，自动将其置为已取消状态，避免占用库存或混淆对账。',
      confirm: '确认清理',
      reason: true,
      collect: function () { return {}; },
    });
    if (!answer) return;
    const res = await request('/api/admin/orders/cleanup-expired', {
      method: 'POST',
      body: { timeoutHours: 24, reason: answer.reason },
    });
    if (res.ok) {
      const count = res.data && res.data.cancelledCount !== undefined ? res.data.cancelledCount : 0;
      showAlert(`已成功关闭 ${count} 笔超时未支付订单`, true);
      loadAdminOrders(1);
    } else {
      showAlert(errorMessage(res, '清理超时订单失败'));
    }
  }

  async function loadQuotaReview(page) {
    page = page || 1;
    currentQuotaReviewPage = page;
    const params = new URLSearchParams();
    const keyword = $('quota-keyword') ? $('quota-keyword').value.trim() : '';
    if (keyword) params.set('keyword', keyword);
    const quotaType = $('quota-type') ? $('quota-type').value.trim() : '';
    if (quotaType) params.set('type', quotaType);
    const startDate = $('quota-start-date') ? $('quota-start-date').value.trim() : '';
    const endDate = $('quota-end-date') ? $('quota-end-date').value.trim() : '';
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    params.set('page', String(page));
    params.set('pageSize', '20');
    const result = await request('/api/admin/quota-logs?' + params.toString());
    const rows = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : null;
    if (!rows) return fill('quota-review-slot', empty('用量流水暂时无法读取。'));
    if (!rows.length) {
      fill('quota-review-slot', empty('没有点数流水。'));
      renderPagination('quota-review-pages', null);
      return;
    }
    fill('quota-review-slot', table([
      { label: '时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
      { label: '账号', fill: function (td, row) { td.textContent = person(row); } },
      { label: '点数', fill: function (td, row) { td.textContent = formatNumber(row.amount); } },
      { label: '余额', fill: function (td, row) { td.textContent = formatNumber(row.balance_after); } },
      { label: '类型', fill: function (td, row) { td.textContent = row.type || '—'; } },
      { label: '备注', fill: function (td, row) { td.textContent = row.remark || '—'; } },
    ], rows));
    renderPagination('quota-review-pages', result.data && result.data.pagination, function (p) {
      loadQuotaReview(p);
    });
  }

  async function promptBlockIp(defaultIp, defaultReason) {
    const box = document.createElement('div');
    box.className = 'stack';

    const ipInput = document.createElement('input');
    ipInput.placeholder = '目标 IP 地址 (例如: 192.0.2.1)';
    ipInput.value = defaultIp || '';
    if (defaultIp) ipInput.readOnly = true;

    const durSelect = document.createElement('select');
    durSelect.innerHTML = `
      <option value="24">拦截 24 小时 (临时封控)</option>
      <option value="1">拦截 1 小时 (短时冷却)</option>
      <option value="72">拦截 3 天 (中度限制)</option>
      <option value="168">拦截 7 天 (长效封禁)</option>
      <option value="0">永久拦截 (直至人工解封)</option>
    `;

    box.append(ipInput, durSelect);

    const answer = await ask({
      title: '配置 IP 访问控制黑名单拦截',
      copy: '被拦截的 IP 发起任何 MetaArc 请求均将直接返回 HTTP 403 阻断访问。请填写拦截原因。',
      extra: box,
      confirm: '确认拦截',
      reason: true,
      collect: function () {
        return {
          ip: ipInput.value.trim(),
          durationHours: parseFloat(durSelect.value) || 0,
        };
      },
    });

    if (!answer || !answer.value || !answer.value.ip) return;
    const res = await request('/api/admin/security/block-ip', {
      method: 'POST',
      body: {
        ip: answer.value.ip,
        durationHours: answer.value.durationHours,
        reason: answer.reason,
      },
    });

    if (res.ok) {
      showAlert(`IP [${answer.value.ip}] 已成功加入安全黑名单拦截`, true);
      loadDiagnostics();
    } else {
      showAlert(errorMessage(res, '拦截 IP 失败'));
    }
  }

  async function promptUnblockIp(ip) {
    const answer = await ask({
      title: '解除 IP 安全拦截',
      copy: `确定要解除对 IP [${ip}] 的安全拦截吗？解除后该 IP 将恢复正常访问权限。`,
      confirm: '确认解封',
      reason: true,
      collect: function () { return { ip }; },
    });
    if (!answer) return;
    const res = await request('/api/admin/security/unblock-ip', {
      method: 'POST',
      body: { ip, reason: answer.reason },
    });
    if (res.ok) {
      showAlert(`IP [${ip}] 已解除拦截`, true);
      loadDiagnostics();
    } else {
      showAlert(errorMessage(res, '解除拦截失败'));
    }
  }

  async function cleanupStalledTasks() {
    const answer = await ask({
      title: '清理超时卡滞任务',
      copy: '系统将扫描超过 30 分钟未更新进度心跳的运行中 (running) 任务，自动置为失败并记录审计日志，以解除调度队列阻塞。',
      confirm: '确认清理',
      reason: true,
      collect: function () { return {}; },
    });
    if (!answer) return;
    const res = await request('/api/admin/tasks/cleanup-stalled', {
      method: 'POST',
      body: { timeoutMinutes: 30, reason: answer.reason },
    });
    if (res.ok) {
      const count = res.data && res.data.cleanedCount !== undefined ? res.data.cleanedCount : 0;
      showAlert(`已成功清理 ${count} 个超时卡滞任务`, true);
      loadDiagnostics();
    } else {
      showAlert(errorMessage(res, '清理超时任务失败'));
    }
  }

  async function checkExpiredSubscriptions() {
    const answer = await ask({
      title: '检查并降级到期会员订阅',
      copy: '系统将扫描所有已超过到期日期的付费会员账号（创作者版/专业版/工作室版），自动回退为基础体验版并记录变更审计。',
      confirm: '执行扫描与降级',
      reason: true,
      collect: function () { return {}; },
    });
    if (!answer) return;
    const res = await request('/api/admin/subscriptions/expire-check', {
      method: 'POST',
      body: { reason: answer.reason },
    });
    if (res.ok) {
      const count = res.data && res.data.downgradedCount !== undefined ? res.data.downgradedCount : 0;
      showAlert(`已成功扫描并回退 ${count} 个到期会员账号`, true);
      loadDiagnostics();
    } else {
      showAlert(errorMessage(res, '订阅过期扫描失败'));
    }
  }

  async function loadDiagnostics() {
    const health = await request('/api/health');
    const status = await request('/api/admin/system-status');
    const sec = await request('/api/admin/security/stats');

    // 安全风控指标大盘
    const secBox = document.createElement('div');
    secBox.className = 'stats';
    const secData = (sec.ok && sec.data && sec.data.data) || {};
    function secStat(label, value, note) {
      const card = document.createElement('article');
      card.className = 'card stat';
      const span = document.createElement('span');
      span.textContent = label;
      const strong = document.createElement('b');
      strong.textContent = value;
      const em = document.createElement('em');
      em.textContent = note;
      card.append(span, strong, em);
      return card;
    }
    secBox.append(secStat('今日登录总数', formatNumber(secData.today_logins || 0), '平台总登入'));
    secBox.append(secStat('今日登录拦截', formatNumber(secData.today_failed || 0), (secData.today_failed || 0) > 0 ? '存在失败尝试' : '安全状态平稳'));
    secBox.append(secStat('今日活跃来源IP', formatNumber(secData.today_ips || 0), '独立公网 IP'));
    secBox.append(secStat('已封禁账号数', formatNumber(secData.suspended_users || 0), '受限账号'));
    fill('security-stats-slot', secBox);

    // 威胁分析: 异常高频失败 IP
    const threatRes = await request('/api/admin/security/threat-ips');
    const threats = threatRes.ok && threatRes.data && Array.isArray(threatRes.data.data) ? threatRes.data.data : [];
    if (!threats.length) {
      fill('threat-ips-slot', empty('近 48 小时未检测到高危撞库攻击行为。'));
    } else {
      fill('threat-ips-slot', table([
        { label: '攻击来源 IP', fill: function (td, r) { td.textContent = r.ip; } },
        { label: '归属地', fill: function (td, r) { td.textContent = r.ip_location || '未知'; } },
        { label: '48h 失败尝试', fill: function (td, r) {
          td.innerHTML = '<b style="color:#b42318;">' + r.fail_count + ' 次</b>';
        } },
        { label: '针对账号数', fill: function (td, r) {
          td.textContent = (r.targeted_accounts_count || 1) + ' 个';
        } },
        { label: '受攻击账号样本', fill: function (td, r) {
          const accounts = Array.isArray(r.sample_accounts) ? r.sample_accounts : [];
          td.innerHTML = accounts.slice(0, 3).map(function (a) { return '<span class="threat-tag">' + a + '</span>'; }).join('') + (accounts.length > 3 ? ' 等' : '');
        } },
        { label: '最后尝试时间', fill: function (td, r) { td.textContent = formatWhen(r.last_attempt_at); } },
        { label: '操作', fill: function (td, r) {
          const btn = document.createElement('button');
          btn.className = 'btn btn-small';
          btn.style.color = '#b42318';
          btn.style.borderColor = '#fda29b';
          btn.textContent = '拦截 IP';
          btn.addEventListener('click', function () {
            promptBlockIp(r.ip, '近 48 小时异常高频失败尝试');
          });
          td.append(btn);
        } },
      ], threats));
    }

    // 已封禁黑名单列表
    const blockedRes = await request('/api/admin/security/blocked-ips');
    const blockedList = blockedRes.ok && blockedRes.data && Array.isArray(blockedRes.data.data) ? blockedRes.data.data : [];
    if (!blockedList.length) {
      fill('blocked-ips-slot', empty('当前没有被拦截的 IP 规则。'));
    } else {
      fill('blocked-ips-slot', table([
        { label: '拦截 IP 地址', fill: function (td, r) { td.innerHTML = '<code>' + r.ip + '</code>'; } },
        { label: '拦截原因', fill: function (td, r) { td.textContent = r.reason || '—'; } },
        { label: '时效状态', fill: function (td, r) {
          if (!r.expires_at) {
            td.innerHTML = '<span class="badge badge-danger">永久封禁</span>';
          } else {
            const exp = new Date(r.expires_at).getTime();
            const now = Date.now();
            if (exp <= now) {
              td.innerHTML = '<span class="badge badge-neutral">已过期</span>';
            } else {
              const hoursLeft = Math.ceil((exp - now) / 3600000);
              td.innerHTML = '<span class="badge badge-warning">剩余 ' + hoursLeft + ' 小时</span>';
            }
          }
        } },
        { label: '操作管理员', fill: function (td, r) { td.textContent = r.blocked_by_nickname || r.blocked_by_email || '系统策略'; } },
        { label: '拦截时间', fill: function (td, r) { td.textContent = formatWhen(r.created_at); } },
        { label: '操作', fill: function (td, r) {
          const unblockBtn = document.createElement('button');
          unblockBtn.className = 'btn btn-small';
          unblockBtn.textContent = '解除拦截';
          unblockBtn.addEventListener('click', function () {
            promptUnblockIp(r.ip);
          });
          td.append(unblockBtn);
        } },
      ], blockedList));
    }

    const lines = [];
    lines.push(health.ok && health.data && health.data.db === 'connected' ? '数据库：已连接' : '数据库：未知');
    const data = status.ok && status.data && status.data.data ? status.data.data : null;
    if (!data) lines.push('运行状态：暂时无法读取');
    else {
      lines.push('进程已运行 ' + (data.uptime_formatted || '未知时长'));
      const mem = data.memory_mb || {};
      lines.push('内存占用：RSS ' + (mem.rss || 0) + ' MB / 堆 ' + (mem.heap_used || 0) + ' MB (总 ' + (mem.heap_total || 0) + ' MB)');
      const pool = data.db_pool || {};
      lines.push('数据库连接池：活动 ' + (pool.total || 0) + ' / 空闲 ' + (pool.idle || 0) + ' / 等待 ' + (pool.waiting || 0));
      const gateway = data.ai_gateway || {};
      lines.push('外部创作服务：' + gatewayLabel(gateway));
      lines.push(data.s3 && data.s3.configured ? '对象存储：已配置' : '对象存储：待接入');
    }
    const box = document.createElement('div');
    lines.forEach(function (line) {
      const p = document.createElement('p');
      p.textContent = line;
      box.append(p);
    });
    fill('health-slot', box);

    const taskKw = $('task-keyword') ? encodeURIComponent($('task-keyword').value.trim()) : '';
    const taskSt = $('task-status-filter') ? encodeURIComponent($('task-status-filter').value) : '';
    let taskUrl = '/api/admin/tasks?page=' + currentTasksPage + '&pageSize=10';
    if (taskKw) taskUrl += '&keyword=' + taskKw;
    if (taskSt) taskUrl += '&status=' + taskSt;
    const taskResult = await request(taskUrl);
    renderTasks('admin-tasks-slot', taskResult, true, function () { loadDiagnostics(); });
    renderPagination('admin-tasks-pages', taskResult.data && taskResult.data.pagination, function (p) {
      currentTasksPage = p;
      loadDiagnostics();
    });

    const mediaKw = $('media-keyword') ? encodeURIComponent($('media-keyword').value.trim()) : '';
    const mediaTp = $('media-type-filter') ? encodeURIComponent($('media-type-filter').value) : '';
    let mediaUrl = '/api/admin/media?page=' + currentMediaPage + '&pageSize=10';
    if (mediaKw) mediaUrl += '&keyword=' + mediaKw;
    if (mediaTp) mediaUrl += '&assetType=' + mediaTp;
    const mediaResult = await request(mediaUrl);
    renderMedia('admin-media-slot', mediaResult, true, function () { loadDiagnostics(); });
    renderPagination('admin-media-pages', mediaResult.data && mediaResult.data.pagination, function (p) {
      currentMediaPage = p;
      loadDiagnostics();
    });
  }

  async function loadAudit(page) {
    page = page || 1;
    currentAuditPage = page;
    const audit = await request('/api/admin/audit?page=' + page + '&pageSize=20');
    const rows = audit.ok && audit.data && Array.isArray(audit.data.data) ? audit.data.data : null;
    if (!rows) fill('audit-slot', empty('变更审计暂时无法读取。'));
    else if (!rows.length) {
      fill('audit-slot', empty('还没有变更记录。'));
      renderPagination('audit-pages', null);
    } else {
      fill('audit-slot', table([
        { label: '时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
        { label: '动作', fill: function (td, row) { td.textContent = row.action || '—'; } },
        { label: '对象', fill: function (td, row) { td.textContent = (row.target_type || '') + ' ' + (row.target_id || ''); } },
        { label: '原因', fill: function (td, row) { td.textContent = row.reason || '—'; } },
        { label: '变化', fill: function (td, row) { td.textContent = briefChange(row.before_value, row.after_value); } },
      ], rows));
      renderPagination('audit-pages', audit.data && audit.data.pagination, function (p) {
        loadAudit(p);
      });
    }

    const logs = await request('/api/admin/login-logs?page=' + currentLoginLogsPage + '&pageSize=20');
    const loginRows = logs.ok && logs.data && Array.isArray(logs.data.data) ? logs.data.data : null;
    if (!loginRows) fill('admin-login-slot', empty('登录记录暂时无法读取。'));
    else if (!loginRows.length) {
      fill('admin-login-slot', empty('还没有登录记录。'));
      renderPagination('admin-login-pages', null);
    } else {
      fill('admin-login-slot', table([
        { label: '时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
        { label: '账号', fill: function (td, row) { td.textContent = row.account || person(row); } },
        { label: '结果', fill: function (td, row) {
          td.innerHTML = row.status === 'success'
            ? '<span class="badge badge-success">成功</span>'
            : '<span class="badge badge-danger">失败</span>' + (row.fail_reason ? '<div class="fine" style="color:#b42318;margin-top:2px;">' + row.fail_reason + '</div>' : '');
        } },
        { label: '客户端设备', fill: function (td, row) { td.textContent = simplifyUserAgent(row.user_agent); } },
        { label: 'IP / 归属地', fill: function (td, row) { td.textContent = [row.ip, row.ip_location].filter(Boolean).join(' ') || '—'; } },
        { label: '操作', fill: function (td, row) {
          if (row.status !== 'success' && row.ip) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-small';
            btn.style.color = 'var(--danger, #b42318)';
            btn.textContent = '拦截 IP';
            btn.addEventListener('click', function () {
              promptBlockIp(row.ip, '登录失败安全审计拦截: ' + (row.fail_reason || '异常尝试'));
            });
            td.append(btn);
          } else {
            td.textContent = '—';
          }
        } },
      ], loginRows));
      renderPagination('admin-login-pages', logs.data && logs.data.pagination, function (p) {
        currentLoginLogsPage = p;
        loadAudit(currentAuditPage);
      });
    }
  }

  async function loadSecuritySettings() {
    const res = await request('/api/admin/settings');
    if (res.ok && res.data && res.data.data) {
      const s = res.data.data;
      if ($('setting-allow-registration')) $('setting-allow-registration').checked = !!s.allow_registration;
      if ($('setting-require-login-captcha')) $('setting-require-login-captcha').checked = !!s.require_login_captcha;
      if ($('setting-require-email-code')) $('setting-require-email-code').checked = !!s.require_email_code;
      if ($('setting-max-reg-per-ip-day')) $('setting-max-reg-per-ip-day').value = s.max_reg_per_ip_day ?? 5;
      if ($('setting-cf-turnstile-enabled')) {
        $('setting-cf-turnstile-enabled').checked = !!s.cf_turnstile_enabled;
        if ($('cf-keys-group')) $('cf-keys-group').hidden = !s.cf_turnstile_enabled;
      }
      if ($('setting-cf-site-key')) $('setting-cf-site-key').value = s.cf_turnstile_site_key || '';
      if ($('setting-cf-secret-key')) $('setting-cf-secret-key').value = s.cf_turnstile_secret_key || '';
    }
    await loadIpRegistrationStats();
  }

  async function loadIpRegistrationStats() {
    const slot = 'ip-reg-stats-slot';
    const minCount = $('ip-reg-min-count') ? $('ip-reg-min-count').value : '2';
    const keyword = $('ip-reg-keyword') ? $('ip-reg-keyword').value.trim() : '';

    let url = '/api/admin/security/ip-registration-stats?minCount=' + encodeURIComponent(minCount);
    if (keyword) url += '&keyword=' + encodeURIComponent(keyword);

    fill(slot, empty('正在分析同 IP 注册聚合数据…'));

    const res = await request(url);
    const rows = (res.ok && res.data && Array.isArray(res.data.data)) ? res.data.data : null;
    if (!rows) return fill(slot, empty('同 IP 注册数据读取失败。'));
    if (!rows.length) return fill(slot, empty('暂无符合聚类条件的注册 IP 记录。'));

    fill(slot, table([
      {
        label: 'IP 地址与归属地',
        fill: function (td, row) {
          const wrap = document.createElement('div');
          wrap.innerHTML = '<span class="badge-ip">' + row.ip + '</span> ' +
            (row.is_blocked ? '<span class="badge badge-danger">已封禁</span>' : '') +
            '<div style="font-size:12px; color:var(--muted); margin-top:2px;">' + (row.location || '未知归属地') + '</div>';
          td.append(wrap);
        }
      },
      {
        label: '关联账号数',
        fill: function (td, row) {
          const today = row.today_reg_count > 0 ? ' <span style="color:#b42318; font-weight:700;">(今日+' + row.today_reg_count + ')</span>' : '';
          td.innerHTML = '<strong>' + row.user_count + '</strong> 个' + today;
        }
      },
      {
        label: '首次 / 最近注册',
        fill: function (td, row) {
          td.innerHTML = '<div style="font-size:12px;">首次: ' + formatWhen(row.first_reg_at) + '</div>' +
            '<div style="font-size:12px; color:var(--muted);">最近: ' + formatWhen(row.last_reg_at) + '</div>';
        }
      },
      {
        label: '关联账号样本',
        fill: function (td, row) {
          const wrap = document.createElement('div');
          wrap.style.display = 'flex';
          wrap.style.flexWrap = 'wrap';
          wrap.style.gap = '4px';
          (row.users || []).slice(0, 4).forEach(function (u) {
            const tag = document.createElement('span');
            tag.className = 'badge-ip';
            tag.style.fontSize = '11px';
            tag.textContent = u.nickname || u.email || u.phone || (u.id ? u.id.slice(0, 8) : '创作者');
            if (u.status === 'suspended') tag.style.textDecoration = 'line-through';
            wrap.append(tag);
          });
          if (row.users && row.users.length > 4) {
            const more = document.createElement('span');
            more.style.fontSize = '11px';
            more.style.color = 'var(--muted)';
            more.textContent = '等共' + row.user_count + '人';
            wrap.append(more);
          }
          td.append(wrap);
        }
      },
      {
        label: '管理操作',
        fill: function (td, row) {
          const wrap = document.createElement('div');
          wrap.style.display = 'flex';
          wrap.style.gap = '6px';

          const btnView = document.createElement('button');
          btnView.type = 'button';
          btnView.className = 'btn-line';
          btnView.style.padding = '2px 8px';
          btnView.style.fontSize = '12px';
          btnView.textContent = '查看这组用户';
          btnView.addEventListener('click', function () {
            $('user-keyword').value = row.ip;
            showView('users');
            loadUsers(1);
          });
          wrap.append(btnView);

          if (row.is_blocked) {
            const btnUnblock = document.createElement('button');
            btnUnblock.type = 'button';
            btnUnblock.className = 'btn-line';
            btnUnblock.style.padding = '2px 8px';
            btnUnblock.style.fontSize = '12px';
            btnUnblock.textContent = '解除拦截';
            btnUnblock.addEventListener('click', async function () {
              await promptUnblockIp(row.ip);
              loadIpRegistrationStats();
            });
            wrap.append(btnUnblock);
          } else {
            const btnBlock = document.createElement('button');
            btnBlock.type = 'button';
            btnBlock.className = 'btn-line';
            btnBlock.style.padding = '2px 8px';
            btnBlock.style.fontSize = '12px';
            btnBlock.style.color = 'var(--danger, #b42318)';
            btnBlock.textContent = '拦截此 IP';
            btnBlock.addEventListener('click', async function () {
              await promptBlockIp(row.ip, '同 IP 关联多账号群注安全拦截');
              loadIpRegistrationStats();
            });
            wrap.append(btnBlock);
          }

          const btnCascade = document.createElement('button');
          btnCascade.type = 'button';
          btnCascade.className = 'btn-line btn-cascade';
          btnCascade.style.padding = '2px 8px';
          btnCascade.style.fontSize = '12px';
          btnCascade.textContent = '一键封禁并冻结账号';
          btnCascade.title = '封禁此 IP 并将名下全部关联创作者账号级联置为冻结状态';
          btnCascade.addEventListener('click', async function () {
            const ok = await ask({
              title: '级联处置: 拦截 IP 并冻结关联账号',
              copy: '即将拦截 IP [' + row.ip + ']，并强制冻结该 IP 名下全部 ' + row.user_count + ' 个关联创作者账号（立即吊销全部登录会话）。确定执行级联处置吗？',
              confirm: '确认拦截并冻结全部账号',
              modalClass: 'modal-danger',
              reason: true,
            });
            if (!ok) return;
            const res = await request('/api/admin/security/block-ip-and-cascade', {
              method: 'POST',
              body: {
                ip: row.ip,
                reason: ok.reason || '同 IP 关联多账号群注违规级联处置',
                durationHours: 0,
              },
            });
            if (res.ok) {
              showAlert((res.data && res.data.message) || ('已成功拦截 IP [' + row.ip + '] 并级联冻结关联账号'));
              await loadIpRegistrationStats();
            } else {
              showAlert((res.data && res.data.message) || '级联处置执行失败');
            }
          });
          wrap.append(btnCascade);

          td.append(wrap);
        }
      }
    ], rows));
  }
  function gatewayLabel(gateway) {
    if (!gateway || !gateway.configured) return '待接入';
    if (gateway.status === 'connected') return '已连通';
    if (gateway.status === 'unreachable') return '未连通';
    if (typeof gateway.status === 'string' && gateway.status.indexOf('http_') === 0) return '响应异常';
    return '未知';
  }
  function briefChange(before, after) {
    try {
      return JSON.stringify(before) + ' → ' + JSON.stringify(after);
    } catch (_) {
      return '—';
    }
  }

  function ask(options) {
    return new Promise(function (resolve) {
      $('modal-title').textContent = options.title || '确认';
      $('modal-copy').textContent = options.copy || '';
      const card = modal.querySelector('.modal-card');
      if (card) {
        card.className = 'modal-card' + (options.modalClass ? ' ' + options.modalClass : '');
      }
      const extra = $('modal-extra');
      extra.replaceChildren();
      if (options.extra) extra.append(options.extra);
      const reason = $('modal-reason');
      const reasonLabel = $('modal-reason-label');
      const needsReason = options.reason !== false;
      reason.hidden = !needsReason;
      reasonLabel.hidden = !needsReason;
      reason.value = '';
      $('modal-submit').textContent = options.confirm || '确认变更';
      modal.hidden = false;
      function finish(value) {
        modal.hidden = true;
        if (card) card.className = 'modal-card';
        modalForm.removeEventListener('submit', onSubmit);
        $('modal-cancel').removeEventListener('click', onCancel);
        resolve(value);
      }
      function onSubmit(event) {
        event.preventDefault();
        const text = reason.value.trim();
        if (needsReason && text.length < 2) {
          showAlert('请填写至少 2 个字的原因');
          return;
        }
        const collected = options.collect ? options.collect() : {};
        collected.reason = text;
        finish(collected);
      }
      function onCancel() { finish(null); }
      modalForm.addEventListener('submit', onSubmit);
      $('modal-cancel').addEventListener('click', onCancel);
      if (needsReason) reason.focus();
    });
  }

  async function submitAuth(path, body, button, onFail) {
    button.disabled = true;
    try {
      const result = await request(path, { method: 'POST', body: body });
      if (!result.ok || !result.data || !result.data.token) {
        showAlert(errorMessage(result, '没有完成'));
        if (onFail) onFail(result);
        return;
      }
      setToken(result.data.token);
      await loadSession();
    } catch (_) {
      showAlert('网络请求失败，请稍后再试');
      if (onFail) onFail(null);
    } finally {
      button.disabled = false;
    }
  }

  async function loadSession() {
    const result = await request('/api/auth/profile');
    if (!result.ok || !result.data || !result.data.user) {
      setToken('');
      currentUser = null;
      showGate('login');
      showAlert(errorMessage(result, '登录态已失效，请重新登录'));
      return;
    }
    currentUser = result.data.user;
    await loadPlans();
    showApp();
  }

  loginForm.addEventListener('submit', function (event) {
    event.preventDefault();
    const account = $('login-account').value.trim();
    const password = $('login-password').value;
    if (!account || !password) return showAlert('请输入账号与密码');

    const body = { account: account, password: password };
    if (publicAuthConfig.require_login_captcha) {
      const captchaCode = $('login-captcha-code') ? $('login-captcha-code').value.trim() : '';
      const captchaId = $('login-captcha-id') ? $('login-captcha-id').value : '';
      if (!captchaCode) return showAlert('请输入图形验证码');
      body.captcha_code = captchaCode;
      body.captcha_id = captchaId;
    }
    if (publicAuthConfig.cf_turnstile_enabled && publicAuthConfig.cf_turnstile_site_key) {
      body.turnstile_token = loginTurnstileToken;
    }

    submitAuth('/api/auth/login', body, loginForm.querySelector('button'), function () {
      if (publicAuthConfig.require_login_captcha) refreshLoginCaptcha();
      resetTurnstile(true);
    });
  });

  registerForm.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!publicAuthConfig.allow_registration) {
      return showAlert('系统当前已暂停开放新用户自主注册');
    }
    const account = $('register-account').value.trim();
    const password = $('register-password').value;
    const nickname = $('register-nickname').value.trim();
    if (!account || password.length < 6) return showAlert('请输入账号，且密码至少 6 位');

    if (publicAuthConfig.require_email_code && account.indexOf('@') < 0) {
      return showAlert('系统当前已开启邮箱安全校验，请使用邮箱地址进行注册');
    }

    const body = { password: password };
    if (nickname) body.nickname = nickname;
    if (account.indexOf('@') >= 0) {
      body.email = account;
      if (publicAuthConfig.require_email_code) {
        const code = $('register-email-code') ? $('register-email-code').value.trim() : '';
        if (!code) return showAlert('请输入收到的邮箱验证码');
        body.email_code = code;
      }
    } else {
      body.phone = account;
    }
    if (publicAuthConfig.cf_turnstile_enabled && publicAuthConfig.cf_turnstile_site_key) {
      body.turnstile_token = registerTurnstileToken;
    }
    submitAuth('/api/auth/register', body, registerForm.querySelector('button[type="submit"]'), function () {
      resetTurnstile(false);
    });
  });
  if ($('btn-forgot-send-code')) {
    $('btn-forgot-send-code').addEventListener('click', handleSendForgotEmailCode);
  }

  forgotForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    const email = $('forgot-email') ? $('forgot-email').value.trim() : '';
    const code = $('forgot-email-code') ? $('forgot-email-code').value.trim() : '';
    const newPassword = $('forgot-password') ? $('forgot-password').value : '';

    if (!email || !code || !newPassword) {
      return showAlert('请完整填写邮箱、验证码与新密码');
    }
    if (newPassword.length < 8) {
      return showAlert('新密码长度至少需要 8 位');
    }

    const body = {
      email: email,
      code: code,
      new_password: newPassword,
    };
    if (publicAuthConfig.cf_turnstile_enabled && publicAuthConfig.cf_turnstile_site_key) {
      body.turnstile_token = forgotTurnstileToken;
    }

    const submitBtn = $('btn-forgot-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '正在重置密码…';
    }

    const result = await request('/api/auth/forgot-password/reset', { method: 'POST', body: body });

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '重置密码并直接登录';
    }

    if (!result.ok) {
      resetTurnstile('forgot');
      showAlert((result.data && result.data.message) || '重置密码失败，请核对验证码后重试');
      return;
    }

    showAlert('密码已成功重置！请使用新密码登录');
    if ($('login-account')) $('login-account').value = email;
    if ($('login-password')) $('login-password').value = '';
    showGate('login');
  });

  if ($('btn-clear-user-ip-filter')) {
    $('btn-clear-user-ip-filter').addEventListener('click', function () {
      if ($('user-keyword')) $('user-keyword').value = '';
      if ($('user-active-filter-bar')) $('user-active-filter-bar').hidden = true;
      loadUsers(1);
    });
  }
  $('show-register').addEventListener('click', function () { showGate('register'); });
  $('register-back').addEventListener('click', function () { showGate('login'); });
  $('show-forgot').addEventListener('click', function () { showGate('forgot'); });
  $('forgot-back').addEventListener('click', function () { showGate('login'); });
  $('btn-logout').addEventListener('click', function () {
    setToken('');
    currentUser = null;
    showGate('login');
  });
  async function downloadCsv(url, fallbackName) {
    showAlert('正在导出数据，请稍候…', true);
    try {
      const t = token();
      const res = await fetch(url, {
        headers: t ? { Authorization: 'Bearer ' + t } : {}
      });
      if (!res.ok) {
        const json = await res.json().catch(function () { return {}; });
        return showAlert(json.message || '导出失败');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      let filename = fallbackName;
      if (disposition && disposition.indexOf('filename=') !== -1) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
      showAlert('已成功导出：' + filename, true);
    } catch (err) {
      console.error('Export error', err);
      showAlert('导出请求异常');
    }
  }

  let currentReleasesManifest = null;
  async function loadReleasesAdmin() {
    loadDownloads();
    const slot = $('releases-admin-slot');
    if (!slot) return;
    const res = await request('/api/admin/releases/manifest');
    if (!res.ok || !res.data || !res.data.data) {
      return fill('releases-admin-slot', empty('无法读取更新配置清单'));
    }
    const manifest = res.data.data;
    currentReleasesManifest = manifest;

    const wrap = document.createElement('div');
    wrap.className = 'stack';

    const globalRow = document.createElement('div');
    globalRow.className = 'search-row';
    globalRow.style.marginBottom = '16px';
    globalRow.innerHTML = '<span style="font-size:13px;font-weight:600;margin-right:8px;">全局默认通道：</span>';
    const channelSel = document.createElement('select');
    channelSel.id = 'rel-global-channel';
    ['stable', 'beta', 'internal'].forEach(function (c) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c === 'stable' ? '正式稳定版 (stable)' : c === 'beta' ? '公测版 (beta)' : '内部测试版 (internal)';
      if (manifest.channel === c) opt.selected = true;
      channelSel.append(opt);
    });
    globalRow.append(channelSel);
    wrap.append(globalRow);

    const platforms = [
      { platform: 'windows', arch: 'x64', title: 'Windows 桌面客户端 (x64)' },
      { platform: 'macos', arch: 'arm64', title: 'macOS Apple Silicon (arm64)' },
      { platform: 'android', arch: 'arm64', title: 'Android 移动创作者端 (arm64)' },
    ];

    const releasesList = Array.isArray(manifest.releases) ? manifest.releases : [];

    platforms.forEach(function (item) {
      const found = releasesList.find(function (r) {
        return r.platform === item.platform && (r.arch === item.arch || !r.arch);
      }) || { platform: item.platform, arch: item.arch, version: '1.0.0', download_url: '', file_size: 0, release_notes: '', signed: true };

      const card = document.createElement('div');
      card.className = 'release-card';
      card.dataset.platform = item.platform;
      card.dataset.arch = item.arch;

      const h4 = document.createElement('h4');
      h4.innerHTML = '<span>' + item.title + '</span><span class="badge badge-neutral">' + item.platform + ' / ' + item.arch + '</span>';

      const grid = document.createElement('div');
      grid.className = 'detail-grid';

      function makeInput(label, key, val, type, placeholder) {
        const div = document.createElement('div');
        div.className = 'detail-item';
        const span = document.createElement('span');
        span.textContent = label;
        const inp = document.createElement('input');
        inp.type = type || 'text';
        inp.placeholder = placeholder || '';
        inp.dataset.key = key;
        inp.value = val ?? '';
        inp.style.width = '100%';
        inp.style.marginTop = '4px';
        inp.style.padding = '6px 8px';
        inp.style.border = '1px solid var(--line)';
        inp.style.borderRadius = '4px';
        inp.style.fontSize = '13px';
        div.append(span, inp);
        return div;
      }

      grid.append(
        makeInput('版本号 (如 1.0.0)', 'version', found.version, 'text', '1.0.0'),
        makeInput('安装包下载地址 (URL)', 'download_url', found.download_url, 'text', 'https://metaarc.com.cn/downloads/...'),
        makeInput('安装包字节大小 (Bytes)', 'file_size', found.file_size, 'number', '80000000'),
      );

      const notesDiv = document.createElement('div');
      notesDiv.className = 'detail-item';
      notesDiv.style.gridColumn = '1 / -1';
      const notesSpan = document.createElement('span');
      notesSpan.textContent = '版本更新说明与 Release Notes';
      const textarea = document.createElement('textarea');
      textarea.dataset.key = 'release_notes';
      textarea.value = found.release_notes || '';
      textarea.rows = 2;
      textarea.style.width = '100%';
      textarea.style.marginTop = '4px';
      textarea.style.padding = '6px 8px';
      textarea.style.border = '1px solid var(--line)';
      textarea.style.borderRadius = '4px';
      textarea.style.fontSize = '13px';
      notesDiv.append(notesSpan, textarea);

      card.append(h4, grid, notesDiv);
      wrap.append(card);
    });

    slot.replaceChildren(wrap);
  }

  async function saveReleaseManifest() {
    const cards = document.querySelectorAll('.release-card');
    if (!cards.length) return showAlert('尚未加载发布卡片');

    const globalChannel = $('rel-global-channel') ? $('rel-global-channel').value : 'stable';
    const releases = [];

    cards.forEach(function (card) {
      const platform = card.dataset.platform;
      const arch = card.dataset.arch;
      const versionInput = card.querySelector('input[data-key="version"]');
      const urlInput = card.querySelector('input[data-key="download_url"]');
      const sizeInput = card.querySelector('input[data-key="file_size"]');
      const notesInput = card.querySelector('textarea[data-key="release_notes"]');

      const version = versionInput ? versionInput.value.trim() : '1.0.0';
      const download_url = urlInput ? urlInput.value.trim() : '';
      const file_size = sizeInput && sizeInput.value ? parseInt(sizeInput.value, 10) : undefined;
      const release_notes = notesInput ? notesInput.value.trim() : '';

      releases.push({
        platform,
        arch,
        version,
        download_url: download_url || undefined,
        file_size: file_size > 0 ? file_size : undefined,
        release_notes: release_notes || undefined,
        signed: true,
        channel: globalChannel,
      });
    });

    const answer = await ask({
      title: '确认保存客户端发布清单',
      copy: '更新将即时同步至 latest.json，影响全平台客户端版本检查与下载中心。',
      confirm: '确认保存发布',
    });
    if (!answer) return;

    const result = await request('/api/admin/releases/manifest', {
      method: 'POST',
      body: {
        channel: globalChannel,
        signed: true,
        releases: releases,
        reason: answer.reason,
      },
    });

    if (!result.ok) return showAlert(errorMessage(result, '保存发布清单失败'));
    showAlert('客户端发布清单已保存并即时生效', true);
    loadReleasesAdmin();
  }

  document.body.addEventListener('click', function (event) {
    const jump = event.target.closest('[data-jump]');
    if (jump) showView(jump.getAttribute('data-jump'));
    const view = event.target.closest('[data-view]');
    if (view) showView(view.getAttribute('data-view'));
    const filter = event.target.closest('[data-user-filter]');
    if (filter) {
      userFilter = filter.getAttribute('data-user-filter') || '';
      document.querySelectorAll('[data-user-filter]').forEach(function (button) {
        button.classList.toggle('is-on', button === filter);
      });
      loadUsers(1);
    }
    const oFilter = event.target.closest('[data-order-filter]');
    if (oFilter) {
      orderFilter = oFilter.getAttribute('data-order-filter') || '';
      document.querySelectorAll('[data-order-filter]').forEach(function (button) {
        button.classList.toggle('is-on', button === oFilter);
      });
      loadAdminOrders(1);
    }
  });
  $('user-search').addEventListener('submit', function (event) { event.preventDefault(); loadUsers(1); });
  $('quota-search').addEventListener('submit', function (event) { event.preventDefault(); loadQuotaReview(1); });
  if ($('order-search')) $('order-search').addEventListener('submit', function (event) { event.preventDefault(); loadAdminOrders(1); });
  if ($('btn-create-user')) $('btn-create-user').addEventListener('click', createUser);
  if ($('btn-create-plan')) $('btn-create-plan').addEventListener('click', createPlanModal);
  if ($('btn-create-order')) $('btn-create-order').addEventListener('click', createManualOrder);
  if ($('btn-cleanup-expired-orders')) $('btn-cleanup-expired-orders').addEventListener('click', cleanupExpiredOrders);
  if ($('btn-export-users')) {
    $('btn-export-users').addEventListener('click', function () {
      const params = new URLSearchParams();
      const keyword = $('user-keyword') ? $('user-keyword').value.trim() : '';
      if (keyword) params.set('keyword', keyword);
      if (userFilter.indexOf('plan:') === 0) params.set('plan', userFilter.slice(5));
      if (userFilter.indexOf('status:') === 0) params.set('status', userFilter.slice(7));
      const startDate = $('user-start-date') ? $('user-start-date').value.trim() : '';
      const endDate = $('user-end-date') ? $('user-end-date').value.trim() : '';
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      downloadCsv('/api/admin/export/users?' + params.toString(), 'metaarc-users.csv');
    });
  }
  if ($('btn-export-orders')) {
    $('btn-export-orders').addEventListener('click', function () {
      const params = new URLSearchParams();
      const keyword = $('order-keyword') ? $('order-keyword').value.trim() : '';
      if (keyword) params.set('keyword', keyword);
      if (orderFilter.indexOf('status:') === 0) params.set('status', orderFilter.slice(7));
      const startDate = $('order-start-date') ? $('order-start-date').value.trim() : '';
      const endDate = $('order-end-date') ? $('order-end-date').value.trim() : '';
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      downloadCsv('/api/admin/export/orders?' + params.toString(), 'metaarc-orders.csv');
    });
  }
  if ($('btn-export-quota')) {
    $('btn-export-quota').addEventListener('click', function () {
      const params = new URLSearchParams();
      const keyword = $('quota-keyword') ? $('quota-keyword').value.trim() : '';
      if (keyword) params.set('keyword', keyword);
      const startDate = $('quota-start-date') ? $('quota-start-date').value.trim() : '';
      const endDate = $('quota-end-date') ? $('quota-end-date').value.trim() : '';
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      downloadCsv('/api/admin/export/quota-logs?' + params.toString(), 'metaarc-quota-logs.csv');
    });
  }
  if ($('task-filter-form')) {
    $('task-filter-form').addEventListener('submit', function (e) {
      e.preventDefault();
      currentTasksPage = 1;
      loadDiagnostics();
    });
  }
  if ($('media-filter-form')) {
    $('media-filter-form').addEventListener('submit', function (e) {
      e.preventDefault();
      currentMediaPage = 1;
      loadDiagnostics();
    });
  }
  if ($('btn-export-tasks')) {
    $('btn-export-tasks').addEventListener('click', function () {
      const params = new URLSearchParams();
      const kw = $('task-keyword') ? $('task-keyword').value.trim() : '';
      const st = $('task-status-filter') ? $('task-status-filter').value : '';
      if (kw) params.set('keyword', kw);
      if (st) params.set('status', st);
      downloadCsv('/api/admin/export/tasks?' + params.toString(), 'metaarc-tasks.csv');
    });
  }
  if ($('btn-cleanup-tasks')) {
    $('btn-cleanup-tasks').addEventListener('click', cleanupStalledTasks);
  }
  if ($('btn-expire-check')) {
    $('btn-expire-check').addEventListener('click', checkExpiredSubscriptions);
  }
  if ($('btn-add-blocked-ip')) {
    $('btn-add-blocked-ip').addEventListener('click', function () {
      promptBlockIp('', '');
    });
  }
  if ($('btn-export-media')) {
    $('btn-export-media').addEventListener('click', function () {
      const params = new URLSearchParams();
      const kw = $('media-keyword') ? $('media-keyword').value.trim() : '';
      const tp = $('media-type-filter') ? $('media-type-filter').value : '';
      if (kw) params.set('keyword', kw);
      if (tp) params.set('assetType', tp);
      downloadCsv('/api/admin/export/media?' + params.toString(), 'metaarc-media.csv');
    });
  }
  if ($('btn-export-logins')) {
    $('btn-export-logins').addEventListener('click', function () {
      downloadCsv('/api/admin/export/login-logs', 'metaarc-logins.csv');
    });
  }
  if ($('btn-export-audit')) {
    $('btn-export-audit').addEventListener('click', function () {
      downloadCsv('/api/admin/export/audit', 'metaarc-audit.csv');
    });
  }
  if ($('btn-save-releases')) {
    $('btn-save-releases').addEventListener('click', saveReleaseManifest);
  }
  if ($('user-ledger-type')) {
    $('user-ledger-type').addEventListener('change', function () {
      loadUserLedger(1);
    });
  }
  if ($('user-order-filters')) {
    $('user-order-filters').addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-user-order-filter]');
      if (!btn) return;
      $('user-order-filters').querySelectorAll('button').forEach(b => b.classList.remove('is-on'));
      btn.classList.add('is-on');
      userOrderFilter = btn.dataset.userOrderFilter || '';
      loadOrders(1);
    });
  }
  $('form-update-profile').addEventListener('submit', async function (event) {
    event.preventDefault();
    const nickname = $('profile-nickname-input').value.trim();
    const phone = $('profile-phone-input') ? $('profile-phone-input').value.trim() : null;
    const result = await request('/api/auth/update-profile', {
      method: 'POST',
      body: { nickname, phone },
    });
    if (!result.ok) return showAlert(errorMessage(result, '保存失败'));
    showAlert('个人资料已保存', true);
    await loadSession();
  });
  $('form-change-password').addEventListener('submit', async function (event) {
    event.preventDefault();
    const result = await request('/api/auth/change-password', {
      method: 'POST',
      body: { oldPassword: $('old-pwd-input').value, newPassword: $('new-pwd-input').value },
    });
    if (!result.ok) return showAlert(errorMessage(result, '没有修改密码'));
    if (result.data && result.data.token) setToken(result.data.token);
    $('old-pwd-input').value = '';
    $('new-pwd-input').value = '';
    showAlert(result.data.message || '密码已更新', true);
  });
  $('btn-logout-others').addEventListener('click', async function () {
    const result = await request('/api/auth/logout-others', { method: 'POST', body: {} });
    if (!result.ok) return showAlert(errorMessage(result, '没有退出其他会话'));
    if (result.data && result.data.token) setToken(result.data.token);
    showAlert(result.data.message || '已处理', true);
  });

  // 登录图形验证码点击刷新
  if ($('login-captcha-btn')) {
    $('login-captcha-btn').addEventListener('click', function () {
      refreshLoginCaptcha();
    });
  }

  // 注册邮箱验证码发送按钮
  if ($('btn-send-email-code')) {
    $('btn-send-email-code').addEventListener('click', function () {
      handleSendEmailCode();
    });
  }

  // 安全策略开关联动与保存
  if ($('setting-cf-turnstile-enabled')) {
    $('setting-cf-turnstile-enabled').addEventListener('change', function () {
      if ($('cf-keys-group')) $('cf-keys-group').hidden = !this.checked;
    });
  }
  if ($('btn-save-security-settings')) {
    $('btn-save-security-settings').addEventListener('click', async function () {
      const btn = $('btn-save-security-settings');
      btn.disabled = true;
      try {
        const body = {
          allow_registration: $('setting-allow-registration') ? $('setting-allow-registration').checked : true,
          require_login_captcha: $('setting-require-login-captcha') ? $('setting-require-login-captcha').checked : true,
          require_email_code: $('setting-require-email-code') ? $('setting-require-email-code').checked : false,
          max_reg_per_ip_day: $('setting-max-reg-per-ip-day') ? Math.max(0, parseInt($('setting-max-reg-per-ip-day').value, 10) || 0) : 5,
          cf_turnstile_enabled: $('setting-cf-turnstile-enabled') ? $('setting-cf-turnstile-enabled').checked : false,
          cf_turnstile_site_key: $('setting-cf-site-key') ? $('setting-cf-site-key').value.trim() : '',
          cf_turnstile_secret_key: $('setting-cf-secret-key') ? $('setting-cf-secret-key').value.trim() : '',
        };

        const res = await request('/api/admin/settings', {
          method: 'POST',
          body: body,
        });

        if (!res.ok) return showAlert(errorMessage(res, '保存系统安全策略失败'));
        showAlert('系统安全策略已保存并即时生效', true);
        await loadPublicAuthConfig();
      } catch (_) {
        showAlert('保存策略网络异常，请稍后重试');
      } finally {
        btn.disabled = false;
      }
    });
  }

  // 同 IP 注册聚类过滤事件
  if ($('ip-reg-min-count')) {
    $('ip-reg-min-count').addEventListener('change', function () {
      loadIpRegistrationStats();
    });
  }
  if ($('ip-reg-search')) {
    $('ip-reg-search').addEventListener('submit', function (e) {
      e.preventDefault();
      loadIpRegistrationStats();
    });
  }

  if (token()) loadSession();
  else showGate('login');
})();

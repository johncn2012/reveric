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
  const ADMIN_VIEWS = ['workspace', 'users', 'plans', 'usage-review', 'releases', 'diagnostics', 'audit'];
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
    plans: ['运营与系统', '套餐权益'],
    'usage-review': ['运营与系统', '用量核对'],
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
      th.textContent = column.label;
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

  function showGate(mode) {
    gate.hidden = false;
    consoleEl.hidden = true;
    loginForm.hidden = mode !== 'login';
    registerForm.hidden = mode !== 'register';
    forgotForm.hidden = mode !== 'forgot';
    loginLinks.hidden = mode !== 'login';
    gateTitle.textContent = mode === 'register' ? '注册账号' : '进入创作台';
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
      support: function () {},
      workspace: loadWorkspace,
      users: loadUsers,
      plans: loadAdminPlans,
      'usage-review': loadQuotaReview,
      releases: loadDownloads,
      diagnostics: loadDiagnostics,
      audit: loadAudit,
    };
    if (loaders[name]) loaders[name]();
  }

  function quotaBlock(user) {
    const wrap = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = '账户点数';
    const remain = num(user.quota);
    const total = num(user.total_quota);
    const line = document.createElement('p');
    line.textContent = '剩余 ' + formatNumber(remain) + ' / 累计发放 ' + formatNumber(total);
    const meter = document.createElement('div');
    meter.className = 'meter';
    const bar = document.createElement('span');
    const ratio = total > 0 && remain !== null ? Math.max(0, Math.min(100, (remain / total) * 100)) : 0;
    bar.style.width = ratio + '%';
    meter.append(bar);
    const note = document.createElement('p');
    note.className = 'fine';
    note.textContent = '文本、图像、视频尚未分开记账。这里也没有单独的周期重置记录。';
    wrap.append(title, line, meter, note);
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
    slot.textContent = count ? '有 ' + count + ' 条订单记录' : '暂无订单 · 支付未开通';
  }
  async function loadPlan() {
    await loadPlans();
    const match = plans.find(function (plan) { return plan.slug === currentUser.plan; });
    const wrap = document.createElement('div');
    const h = document.createElement('h2');
    h.textContent = match ? match.name : planName(currentUser.plan);
    wrap.append(h);
    if (!match) {
      wrap.append(empty('套餐接口没有返回当前档位，页面不补写价格。'));
    } else {
      const price = document.createElement('p');
      const yuan = num(match.price_cents);
      price.textContent = yuan === null ? '价格未知' : ('¥' + (yuan / 100).toLocaleString('zh-CN') + (match.billing_cycle === 'monthly' ? ' / 月' : ''));
      const points = document.createElement('p');
      points.textContent = formatNumber(match.quota_points) + ' 点';
      const closed = document.createElement('p');
      closed.className = 'fine';
      closed.textContent = '支付尚未开通，不能购买或续费。';
      wrap.append(price, points, closed);
      const features = Array.isArray(match.features) ? match.features : [];
      features.forEach(function (item) {
        if (typeof item !== 'string') return;
        const line = document.createElement('p');
        line.textContent = item;
        wrap.append(line);
      });
    }
    fill('plan-detail', wrap);
  }
  async function loadUsage() {
    fill('usage-summary', quotaBlock(currentUser));
    const ledger = await request('/api/auth/quota/logs');
    renderLedger('ledger-slot', ledger);
    const tasks = await request('/api/tasks/list');
    renderTasks('user-tasks-slot', tasks, false);
    const media = await request('/api/media/list');
    renderMedia('user-media-slot', media, false);
  }
  function renderLedger(id, result) {
    const rows = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : null;
    if (!rows) return fill(id, empty('点数流水暂时无法读取。'));
    if (!rows.length) return fill(id, empty('还没有点数流水。'));
    const labels = { purchase: '增加', consumption: '消耗', admin_grant: '调整' };
    fill(id, table([
      { label: '时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
      { label: '点数', fill: function (td, row) { td.textContent = formatNumber(row.amount); } },
      { label: '余额', fill: function (td, row) { td.textContent = formatNumber(row.balance_after); } },
      { label: '类型', fill: function (td, row) { td.textContent = labels[row.type] || row.type || '—'; } },
      { label: '备注', fill: function (td, row) { td.textContent = row.remark || '—'; } },
    ], rows));
  }
  function renderTasks(id, result, admin) {
    const rows = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : null;
    if (!rows) return fill(id, empty('任务暂时无法读取。'));
    if (!rows.length) return fill(id, empty('没有创作任务。'));
    const columns = [
      { label: '类型', fill: function (td, row) { td.textContent = row.task_type || '—'; } },
      { label: '状态', fill: function (td, row) { td.textContent = row.status || '—'; } },
      { label: '时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
    ];
    if (admin) columns.unshift({ label: '账号', fill: function (td, row) { td.textContent = person(row); } });
    fill(id, table(columns, rows));
  }
  function renderMedia(id, result, admin) {
    const rows = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : null;
    if (!rows) return fill(id, empty('文件索引暂时无法读取。'));
    if (!rows.length) return fill(id, empty('没有云端文件记录。'));
    const columns = [
      { label: '类型', fill: function (td, row) { td.textContent = row.asset_type || '—'; } },
      { label: '大小', fill: function (td, row) { td.textContent = formatNumber(row.byte_size); } },
      { label: '时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
    ];
    if (admin) columns.unshift({ label: '账号', fill: function (td, row) { td.textContent = person(row); } });
    fill(id, table(columns, rows));
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
      else if (data.has_update && data.download_url) {
        detail.textContent = [data.version, data.signed === true ? '已签名' : '未签名', data.channel].filter(Boolean).join(' · ');
        const link = document.createElement('a');
        link.href = data.download_url;
        link.rel = 'noopener';
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
    const logs = await request('/api/auth/login-logs');
    const rows = logs.ok && logs.data && Array.isArray(logs.data.data) ? logs.data.data : null;
    if (!rows) fill('login-logs-slot', empty('登录记录暂时无法读取。'));
    else if (!rows.length) fill('login-logs-slot', empty('还没有登录记录。'));
    else fill('login-logs-slot', table([
      { label: '时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
      { label: '结果', fill: function (td, row) { td.textContent = row.status === 'success' ? '成功' : '失败'; } },
      { label: 'IP', fill: function (td, row) { td.textContent = row.ip || '—'; } },
      { label: '位置', fill: function (td, row) { td.textContent = row.ip_location || '—'; } },
    ], rows));
    renderKey();
  }
  function renderKey() {
    const slot = $('key-slot');
    slot.replaceChildren();
    const key = currentUser.new_api_key || '';
    const code = document.createElement('code');
    code.textContent = key || '当前没有可展示的密钥';
    const row = document.createElement('div');
    row.className = 'actions';
    if (key && !key.startsWith('sk-mock-')) {
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = '复制';
      copy.addEventListener('click', function () {
        navigator.clipboard.writeText(key).then(function () { showAlert('已复制', true); }).catch(function () { showAlert('复制失败'); });
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
      warn.textContent = '这是占位值，不能当作可用密钥。';
      slot.append(code, warn, row);
      return;
    }
    slot.append(code, row);
  }
  async function resetOwnKey() {
    const answer = await ask({ title: '重置客户端密钥', copy: '旧密钥会立即失效。', reason: false, confirm: '确认重置' });
    if (!answer) return;
    const result = await request('/api/auth/reset-api-key', { method: 'POST' });
    if (!result.ok) return showAlert(errorMessage(result, '重置失败'));
    currentUser.new_api_key = result.data.new_api_key || '';
    renderKey();
    showAlert(result.data.message || '密钥已重置', true);
  }
  async function loadOrders() {
    const result = await request('/api/auth/orders');
    const rows = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : null;
    if (!rows) return fill('orders-slot', empty('订单暂时无法读取。'));
    if (!rows.length) return fill('orders-slot', empty('暂无订单 · 支付未开通'));
    fill('orders-slot', table([
      { label: '套餐', fill: function (td, row) { td.textContent = row.plan_name || '—'; } },
      { label: '状态', fill: function (td, row) { td.textContent = row.status || '—'; } },
      { label: '时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
    ], rows));
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
    const tasks = overview.ok && overview.data && overview.data.data ? overview.data.data.active_tasks : null;
    wrap.append(stat('诊断工单', '未接入', '没有工单表，不能显示编号'));
    wrap.append(stat('进行中的创作任务', tasks === null || tasks === undefined ? '未知' : String(tasks), '来自任务队列'));
    const dbOk = health.ok && health.data && health.data.db === 'connected';
    const gateway = status.ok && status.data && status.data.data ? status.data.data.ai_gateway : null;
    const gatewayText = gatewayLabel(gateway);
    wrap.append(stat('服务健康', dbOk ? '数据库已连接' : '数据库未知', '外部依赖：' + gatewayText));
    $('workspace-stats').replaceChildren(wrap);
    const taskResult = await request('/api/admin/tasks');
    renderTasks('workspace-tasks', taskResult, true);
  }
  async function loadUsers() {
    const params = new URLSearchParams();
    const keyword = $('user-keyword').value.trim();
    if (keyword) params.set('keyword', keyword);
    if (userFilter.indexOf('plan:') === 0) params.set('plan', userFilter.slice(5));
    if (userFilter.indexOf('status:') === 0) params.set('status', userFilter.slice(7));
    const result = await request('/api/admin/users' + (params.toString() ? '?' + params.toString() : ''));
    const rows = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : null;
    if (!rows) return fill('users-slot', empty('用户列表暂时无法读取。'));
    if (!rows.length) return fill('users-slot', empty('没有符合条件的用户。'));
    fill('users-slot', table([
      { label: '账号', fill: function (td, row) { td.textContent = person(row); } },
      { label: '邮箱 / 手机', fill: function (td, row) { td.textContent = [row.email, row.phone].filter(Boolean).join(' / ') || '—'; } },
      { label: '套餐', fill: function (td, row) { td.textContent = planName(row.plan); } },
      { label: '角色', fill: function (td, row) { td.textContent = row.role === 'admin' ? '管理员' : '用户'; } },
      { label: '状态', fill: function (td, row) { td.textContent = row.status === 'suspended' ? '已封禁' : '正常'; } },
      { label: '剩余点数', fill: function (td, row) { td.textContent = formatNumber(row.quota); } },
      { label: '操作', fill: function (td, row) { td.append(userActions(row)); } },
    ], rows));
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
    add('权限', function () { return changeRole(row); });
    add('套餐', function () { return changePlan(row); });
    add('状态', function () { return changeStatus(row); });
    add('调账', function () { return adjustQuota(row); });
    add('流水', function () { return showUserLedger(row); });
    return box;
  }
  async function changeRole(row) {
    const next = row.role === 'admin' ? 'user' : 'admin';
    const answer = await ask({
      title: next === 'admin' ? '设为管理员' : '取消管理员',
      copy: (person(row)) + ' 目前是' + (row.role === 'admin' ? '管理员' : '用户') + '。管理员可以查看用户、调整套餐和点数。此操作不能降级你自己。',
      confirm: '确认变更',
    });
    if (!answer) return;
    const result = await request('/api/admin/users/' + row.id + '/set-role', { method: 'POST', body: { role: next, reason: answer.reason } });
    if (!result.ok) return showAlert(errorMessage(result, '变更失败'));
    showAlert('权限已更新', true);
    loadUsers();
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
    loadUsers();
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
    loadUsers();
  }
  async function adjustQuota(row) {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '1';
    input.placeholder = '正数增加，负数扣减';
    const answer = await ask({ title: '调整点数', copy: person(row) + ' 当前剩余 ' + formatNumber(row.quota) + '。', extra: input, confirm: '确认调账', collect: function () { return { amount: input.value }; } });
    if (!answer) return;
    const result = await request('/api/admin/users/' + row.id + '/adjust-quota', { method: 'POST', body: { amount: Number(answer.amount), reason: answer.reason } });
    if (!result.ok) return showAlert(errorMessage(result, '调账失败'));
    showAlert('点数已调整', true);
    loadUsers();
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
    const box = document.createElement('div');
    box.className = 'stack';
    box.append(email, password, nickname);
    const answer = await ask({ title: '新建账号', copy: '新账号默认是普通用户和基础体验。不会发送邮件。', extra: box, confirm: '创建', collect: function () { return { email: email.value.trim(), password: password.value, nickname: nickname.value.trim() }; } });
    if (!answer) return;
    const result = await request('/api/admin/users/create', { method: 'POST', body: { email: answer.email, password: answer.password, nickname: answer.nickname, reason: answer.reason } });
    if (!result.ok) return showAlert(errorMessage(result, '创建失败'));
    showAlert('账号已创建', true);
    loadUsers();
  }
  async function loadAdminPlans() {
    const result = await request('/api/admin/plans');
    const rows = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : null;
    if (!rows) return fill('plans-slot', empty('套餐暂时无法读取。'));
    fill('plans-slot', table([
      { label: '名称', fill: function (td, row) { td.textContent = row.name || '—'; } },
      { label: '价格（分）', fill: function (td, row) { td.textContent = formatNumber(row.price_cents); } },
      { label: '点数', fill: function (td, row) { td.textContent = formatNumber(row.quota_points); } },
      { label: '展示', fill: function (td, row) { td.textContent = row.is_active ? '上架' : '下架'; } },
      { label: '操作', fill: function (td, row) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = row.is_active ? '下架' : '上架';
        button.addEventListener('click', function () { return togglePlan(row); });
        td.append(button);
      } },
    ], rows));
  }
  async function togglePlan(row) {
    const answer = await ask({ title: row.is_active ? '下架套餐' : '上架套餐', copy: '这只改变官网是否展示，不会产生付款。', confirm: '确认变更' });
    if (!answer) return;
    const result = await request('/api/admin/plans/' + encodeURIComponent(row.id) + '/toggle', { method: 'POST', body: { reason: answer.reason } });
    if (!result.ok) return showAlert(errorMessage(result, '操作失败'));
    showAlert(result.data.message || '已更新', true);
    loadAdminPlans();
  }
  async function loadQuotaReview() {
    const keyword = $('quota-keyword').value.trim();
    const result = await request('/api/admin/quota-logs' + (keyword ? '?keyword=' + encodeURIComponent(keyword) : ''));
    const rows = result.ok && result.data && Array.isArray(result.data.data) ? result.data.data : null;
    if (!rows) return fill('quota-review-slot', empty('用量流水暂时无法读取。'));
    if (!rows.length) return fill('quota-review-slot', empty('没有点数流水。'));
    fill('quota-review-slot', table([
      { label: '时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
      { label: '账号', fill: function (td, row) { td.textContent = person(row); } },
      { label: '点数', fill: function (td, row) { td.textContent = formatNumber(row.amount); } },
      { label: '余额', fill: function (td, row) { td.textContent = formatNumber(row.balance_after); } },
      { label: '类型', fill: function (td, row) { td.textContent = row.type || '—'; } },
      { label: '备注', fill: function (td, row) { td.textContent = row.remark || '—'; } },
    ], rows));
  }
  async function loadDiagnostics() {
    const health = await request('/api/health');
    const status = await request('/api/admin/system-status');
    const lines = [];
    lines.push(health.ok && health.data && health.data.db === 'connected' ? '数据库：已连接' : '数据库：未知');
    const data = status.ok && status.data && status.data.data ? status.data.data : null;
    if (!data) lines.push('运行状态：暂时无法读取');
    else {
      lines.push('进程已运行 ' + (data.uptime_formatted || '未知时长'));
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
    const orders = await request('/api/admin/orders');
    const orderCount = orders.ok && orders.data && Array.isArray(orders.data.data) ? orders.data.data.length : null;
    const orderLine = document.createElement('p');
    orderLine.textContent = orderCount === null ? '订单记录：暂时无法读取' : (orderCount ? '订单记录：' + orderCount + ' 条' : '订单记录：没有记录，支付尚未开通');
    box.append(orderLine);
    renderTasks('admin-tasks-slot', await request('/api/admin/tasks'), true);
    const media = await request('/api/admin/media');
    const mediaRows = media.ok && media.data && Array.isArray(media.data.data) ? media.data.data : null;
    if (!mediaRows) fill('admin-media-slot', empty('文件索引暂时无法读取。'));
    else if (!mediaRows.length) fill('admin-media-slot', empty('没有云端文件记录。'));
    else renderMedia('admin-media-slot', { ok: true, data: { data: mediaRows } }, true);
  }
  async function loadAudit() {
    const audit = await request('/api/admin/audit');
    const rows = audit.ok && audit.data && Array.isArray(audit.data.data) ? audit.data.data : null;
    if (!rows) fill('audit-slot', empty('变更审计暂时无法读取。'));
    else if (!rows.length) fill('audit-slot', empty('还没有变更记录。'));
    else fill('audit-slot', table([
      { label: '时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
      { label: '动作', fill: function (td, row) { td.textContent = row.action || '—'; } },
      { label: '对象', fill: function (td, row) { td.textContent = (row.target_type || '') + ' ' + (row.target_id || ''); } },
      { label: '原因', fill: function (td, row) { td.textContent = row.reason || '—'; } },
      { label: '变化', fill: function (td, row) { td.textContent = briefChange(row.before_value, row.after_value); } },
    ], rows));
    const logs = await request('/api/admin/login-logs');
    const loginRows = logs.ok && logs.data && Array.isArray(logs.data.data) ? logs.data.data : null;
    if (!loginRows) fill('admin-login-slot', empty('登录记录暂时无法读取。'));
    else if (!loginRows.length) fill('admin-login-slot', empty('还没有登录记录。'));
    else fill('admin-login-slot', table([
      { label: '时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
      { label: '账号', fill: function (td, row) { td.textContent = row.account || person(row); } },
      { label: '结果', fill: function (td, row) { td.textContent = row.status || '—'; } },
      { label: 'IP', fill: function (td, row) { td.textContent = row.ip || '—'; } },
    ], loginRows));
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

  async function submitAuth(path, body, button) {
    button.disabled = true;
    try {
      const result = await request(path, { method: 'POST', body: body });
      if (!result.ok || !result.data || !result.data.token) {
        showAlert(errorMessage(result, '没有完成'));
        return;
      }
      setToken(result.data.token);
      await loadSession();
    } catch (_) {
      showAlert('网络请求失败，请稍后再试');
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
      if (result.status !== 401) showAlert(errorMessage(result, '登录态已失效'));
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
    submitAuth('/api/auth/login', { account: account, password: password }, loginForm.querySelector('button'));
  });
  registerForm.addEventListener('submit', function (event) {
    event.preventDefault();
    const account = $('register-account').value.trim();
    const password = $('register-password').value;
    const nickname = $('register-nickname').value.trim();
    if (!account || password.length < 6) return showAlert('请输入账号，且密码至少 6 位');
    const body = { password: password };
    if (nickname) body.nickname = nickname;
    if (account.indexOf('@') >= 0) body.email = account;
    else body.phone = account;
    submitAuth('/api/auth/register', body, registerForm.querySelector('button'));
  });
  forgotForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    const result = await request('/api/auth/forgot-password', { method: 'POST', body: {} });
    showAlert(errorMessage(result, '找回密码尚未开通'));
  });
  $('show-register').addEventListener('click', function () { showGate('register'); });
  $('register-back').addEventListener('click', function () { showGate('login'); });
  $('show-forgot').addEventListener('click', function () { showGate('forgot'); });
  $('forgot-back').addEventListener('click', function () { showGate('login'); });
  $('btn-logout').addEventListener('click', function () {
    setToken('');
    currentUser = null;
    showGate('login');
  });
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
      loadUsers();
    }
  });
  $('user-search').addEventListener('submit', function (event) { event.preventDefault(); loadUsers(); });
  $('quota-search').addEventListener('submit', function (event) { event.preventDefault(); loadQuotaReview(); });
  $('btn-create-user').addEventListener('click', createUser);
  $('form-update-profile').addEventListener('submit', async function (event) {
    event.preventDefault();
    const result = await request('/api/auth/update-profile', { method: 'POST', body: { nickname: $('profile-nickname-input').value.trim() } });
    if (!result.ok) return showAlert(errorMessage(result, '没有保存'));
    showAlert('昵称已保存', true);
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

  if (token()) loadSession();
  else showGate('login');
})();

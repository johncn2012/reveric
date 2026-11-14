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
  const ADMIN_VIEWS = ['workspace', 'users', 'plans', 'orders-admin', 'usage-review', 'releases', 'diagnostics', 'audit'];
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
      'orders-admin': loadAdminOrders,
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
      columns.push({ label: '操作', fill: function (td, row) {
        const box = document.createElement('div');
        box.className = 'actions';
        const detailBtn = document.createElement('button');
        detailBtn.type = 'button';
        detailBtn.textContent = '详情';
        detailBtn.addEventListener('click', function () { return showTaskDetail(row); });
        box.append(detailBtn);

        if (['pending', 'running', 'processing'].includes(row.status)) {
          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.textContent = '终止';
          cancelBtn.addEventListener('click', function () { return cancelTask(row, onReload); });
          box.append(cancelBtn);
        }

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.textContent = '删除';
        delBtn.addEventListener('click', function () { return deleteTask(row, onReload); });
        box.append(delBtn);

        td.append(box);
      } });
    }
    fill(id, table(columns, rows));
  }
  async function showTaskDetail(row) {
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
    box.append(item('创作者', person(row)));
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
    await ask({ title: '任务详情', reason: false, extra: box, confirm: '关闭' });
  }
  async function cancelTask(row, onReload) {
    const answer = await ask({ title: '终止任务', copy: '强制将进行中的任务标记为终止失败。', confirm: '确认终止', reason: false });
    if (!answer) return;
    const result = await request('/api/admin/tasks/' + row.id + '/cancel', { method: 'POST' });
    if (!result.ok) return showAlert(errorMessage(result, '终止失败'));
    showAlert('任务已终止', true);
    if (onReload) onReload();
  }
  async function deleteTask(row, onReload) {
    const answer = await ask({ title: '删除任务记录', copy: '从调度队列中永久清除该记录。', confirm: '确认删除', reason: false });
    if (!answer) return;
    const result = await request('/api/admin/tasks/' + row.id, { method: 'DELETE' });
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
      columns.push({ label: '操作', fill: function (td, row) {
        const box = document.createElement('div');
        box.className = 'actions';
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
    }
    fill(id, table(columns, rows));
  }
  async function deleteMedia(row, onReload) {
    const answer = await ask({ title: '移除媒体记录', copy: '从登记簿中移除此媒体索引。', confirm: '确认删除', reason: false });
    if (!answer) return;
    const result = await request('/api/admin/media/' + row.id, { method: 'DELETE' });
    if (!result.ok) return showAlert(errorMessage(result, '移除失败'));
    showAlert('媒体记录已移除', true);
    if (onReload) onReload();
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
        detail.textContent = [data.version, data.signed === true ? '已签名' : '未签名', channelLabel(data.channel)].filter(Boolean).join(' · ');
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
  async function loadUsers(page) {
    page = page || 1;
    currentUserPage = page;
    const params = new URLSearchParams();
    const keyword = $('user-keyword').value.trim();
    if (keyword) params.set('keyword', keyword);
    if (userFilter.indexOf('plan:') === 0) params.set('plan', userFilter.slice(5));
    if (userFilter.indexOf('status:') === 0) params.set('status', userFilter.slice(7));
    params.set('page', String(page));
    params.set('pageSize', '20');

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
      { label: '选择', fill: function (td, row) {
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = selectedUserIds.has(row.id);
        chk.addEventListener('change', function () {
          if (chk.checked) selectedUserIds.add(row.id);
          else selectedUserIds.delete(row.id);
          updateBatchBar();
        });
        td.append(chk);
      } },
      { label: '账号', fill: function (td, row) { td.textContent = person(row); } },
      { label: '邮箱 / 手机', fill: function (td, row) { td.textContent = [row.email, row.phone].filter(Boolean).join(' / ') || '—'; } },
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
    return '<span class="badge badge-neutral">' + (status || '—') + '</span>';
  }

  async function loadAdminOrders(page) {
    page = page || 1;
    currentOrderPage = page;
    const params = new URLSearchParams();
    const keyword = $('order-keyword') ? $('order-keyword').value.trim() : '';
    if (keyword) params.set('keyword', keyword);
    if (orderFilter.indexOf('status:') === 0) params.set('status', orderFilter.slice(7));
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
        td.append(box);
      } },
    ], rows));

    renderPagination('admin-orders-pages', result.data && result.data.pagination, function (p) {
      loadAdminOrders(p);
    });
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

  async function loadQuotaReview(page) {
    page = page || 1;
    currentQuotaReviewPage = page;
    const keyword = $('quota-keyword').value.trim();
    const result = await request('/api/admin/quota-logs?page=' + page + '&pageSize=20' + (keyword ? '&keyword=' + encodeURIComponent(keyword) : ''));
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

    const taskResult = await request('/api/admin/tasks?page=' + currentTasksPage + '&pageSize=10');
    renderTasks('admin-tasks-slot', taskResult, true, function () { loadDiagnostics(); });
    renderPagination('admin-tasks-pages', taskResult.data && taskResult.data.pagination, function (p) {
      currentTasksPage = p;
      loadDiagnostics();
    });

    const mediaResult = await request('/api/admin/media?page=' + currentMediaPage + '&pageSize=10');
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
            : '<span class="badge badge-danger">失败</span>';
        } },
        { label: 'IP / 归属地', fill: function (td, row) { td.textContent = [row.ip, row.ip_location].filter(Boolean).join(' ') || '—'; } },
      ], loginRows));
      renderPagination('admin-login-pages', logs.data && logs.data.pagination, function (p) {
        currentLoginLogsPage = p;
        loadAudit(currentAuditPage);
      });
    }
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

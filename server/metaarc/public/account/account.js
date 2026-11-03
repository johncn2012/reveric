/**
 * 同域账号中心。只调用规范账号路径，只渲染接口返回的字段。
 * 规范路径：POST /api/auth/login、POST /api/auth/register、GET /api/auth/profile、
 * GET /api/auth/orders、GET /api/auth/quota/logs。套餐名称来自 GET /api/plans。
 */
(function () {
  const TOKEN_KEY = 'metaarc_account_token';
  const alertEl = document.getElementById('alert');
  const sessionOut = document.getElementById('session-out');
  const sessionIn = document.getElementById('session-in');
  const slots = {
    profile: document.getElementById('profile-fields'),
    plan: document.getElementById('plan-slot'),
    balance: document.getElementById('balance-slot'),
    key: document.getElementById('key-slot'),
    orders: document.getElementById('orders-slot'),
    ledger: document.getElementById('ledger-slot'),
  };

  function showAlert(message) {
    if (!message) {
      alertEl.hidden = true;
      alertEl.textContent = '';
      return;
    }
    alertEl.hidden = false;
    alertEl.textContent = message;
  }

  function token() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(value) {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function request(path, options) {
    const headers = Object.assign({ Accept: 'application/json' }, options && options.headers);
    if (options && options.body) headers['Content-Type'] = 'application/json';
    const current = token();
    if (current) headers.Authorization = 'Bearer ' + current;
    const res = await fetch(path, {
      method: (options && options.method) || 'GET',
      headers: headers,
      body: options && options.body ? JSON.stringify(options.body) : undefined,
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = null;
    }
    return { res: res, data: data };
  }

  function errorMessage(result, fallback) {
    const message = result.data && result.data.message;
    if (typeof message === 'string' && message.trim()) return message.trim();
    return fallback + ' (HTTP ' + result.res.status + ')';
  }

  function clearSlots() {
    Object.keys(slots).forEach(function (name) {
      slots[name].replaceChildren();
    });
  }

  function showLoggedOut() {
    sessionOut.hidden = false;
    sessionIn.hidden = true;
    clearSlots();
  }

  function showLoggedIn() {
    sessionOut.hidden = true;
    sessionIn.hidden = false;
  }

  function addField(dl, label, value) {
    if (value === undefined || value === null || value === '') return;
    const row = document.createElement('div');
    row.className = 'field';
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = String(value);
    row.append(dt, dd);
    dl.append(row);
  }

  function formatNumber(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return null;
    return amount.toLocaleString('zh-CN');
  }

  function formatCents(cents) {
    const amount = Number(cents);
    if (!Number.isFinite(amount)) return null;
    const yuan = amount / 100;
    const text = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
    return '¥' + text;
  }

  function renderProfile(user) {
    const dl = slots.profile;
    dl.replaceChildren();
    addField(dl, '昵称', user.nickname);
    addField(dl, '邮箱', user.email);
    addField(dl, '手机', user.phone);
    addField(dl, '角色', user.role);
    addField(dl, '套餐标识', user.plan);
    addField(dl, '到期', user.expires_at);
    addField(dl, '用户 ID', user.id);
    if (!dl.childElementCount) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = '资料接口没有返回可展示的字段。';
      dl.append(empty);
    }
  }

  function renderBalance(user) {
    const slot = slots.balance;
    slot.replaceChildren();
    const quota = formatNumber(user.quota);
    const total = formatNumber(user.total_quota);
    if (quota === null && total === null) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = '资料接口没有返回余额。';
      slot.append(empty);
      return;
    }
    const dl = document.createElement('dl');
    if (quota !== null) addField(dl, '可用', quota);
    if (total !== null) addField(dl, '总量', total);
    slot.append(dl);
  }

  function renderKey(user) {
    const slot = slots.key;
    slot.replaceChildren();
    const key = typeof user.new_api_key === 'string' ? user.new_api_key.trim() : '';
    const base = typeof user.new_api_base_url === 'string' ? user.new_api_base_url.trim() : '';
    const note = document.createElement('p');
    note.className = 'empty';
    if (!key || key.indexOf('sk-mock-') === 0) {
      note.textContent = '算力通道尚未开通，接口没有返回可用密钥。';
      slot.append(note);
    } else {
      const code = document.createElement('p');
      code.className = 'mono';
      code.textContent = key;
      slot.append(code);
    }
    if (base) {
      const line = document.createElement('p');
      line.className = 'empty';
      line.textContent = '算力地址：' + base;
      slot.append(line);
    }
  }

  function renderPlan(user, plansResult) {
    const slot = slots.plan;
    slot.replaceChildren();
    const slug = typeof user.plan === 'string' ? user.plan : '';
    if (!plansResult.res.ok || !plansResult.data || plansResult.data.success !== true || !Array.isArray(plansResult.data.data)) {
      const missing = document.createElement('p');
      missing.className = 'empty';
      missing.textContent = slug
        ? '套餐列表暂时无法获取。当前标识：' + slug
        : '套餐列表暂时无法获取，资料里也没有套餐标识。';
      slot.append(missing);
      return;
    }
    const match = plansResult.data.data.find(function (plan) {
      return plan && plan.slug === slug;
    });
    if (!match) {
      const missing = document.createElement('p');
      missing.className = 'empty';
      missing.textContent = slug ? '套餐列表里没有「' + slug + '」。' : '资料里没有套餐标识。';
      slot.append(missing);
      return;
    }
    const dl = document.createElement('dl');
    addField(dl, '名称', match.name);
    addField(dl, '标识', match.slug);
    const price = formatCents(match.price_cents);
    if (price) addField(dl, '价格', price + cycleSuffix(match.billing_cycle));
    const points = formatNumber(match.quota_points);
    if (points) addField(dl, '点数', points);
    slot.append(dl);
  }

  function cycleSuffix(cycle) {
    if (cycle === 'monthly') return ' / 月';
    if (cycle === 'yearly') return ' / 年';
    if (typeof cycle === 'string' && cycle.trim()) return ' / ' + cycle.trim();
    return '';
  }

  function renderTable(slot, columns, rows, emptyText) {
    slot.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = emptyText;
      slot.append(empty);
      return;
    }
    const table = document.createElement('table');
    const head = document.createElement('tr');
    columns.forEach(function (column) {
      const th = document.createElement('th');
      th.textContent = column.label;
      head.append(th);
    });
    const thead = document.createElement('thead');
    thead.append(head);
    const tbody = document.createElement('tbody');
    rows.forEach(function (row) {
      const tr = document.createElement('tr');
      columns.forEach(function (column) {
        const td = document.createElement('td');
        td.textContent = column.value(row);
        tr.append(td);
      });
      tbody.append(tr);
    });
    table.append(thead, tbody);
    slot.append(table);
  }

  function cell(value) {
    if (value === undefined || value === null || value === '') return '';
    return String(value);
  }

  function renderOrders(result) {
    if (!result.res.ok || !result.data || result.data.success !== true || !Array.isArray(result.data.data)) {
      slots.orders.replaceChildren();
      const note = document.createElement('p');
      note.className = 'empty';
      note.textContent = errorMessage(result, '无法获取订单');
      slots.orders.append(note);
      return;
    }
    renderTable(slots.orders, [
      { label: '套餐', value: function (row) { return cell(row.plan_name || row.plan_slug); } },
      { label: '金额', value: function (row) { return formatCents(row.amount_cents) || ''; } },
      { label: '点数', value: function (row) { return formatNumber(row.quota_points) || ''; } },
      { label: '渠道', value: function (row) { return cell(row.pay_channel); } },
      { label: '状态', value: function (row) { return cell(row.status); } },
      { label: '创建', value: function (row) { return cell(row.created_at); } },
      { label: '支付时间', value: function (row) { return cell(row.paid_at); } },
    ], result.data.data, '没有订单');
  }

  function renderLedger(result) {
    if (!result.res.ok || !result.data || result.data.success !== true || !Array.isArray(result.data.data)) {
      slots.ledger.replaceChildren();
      const note = document.createElement('p');
      note.className = 'empty';
      note.textContent = errorMessage(result, '无法获取流水');
      slots.ledger.append(note);
      return;
    }
    renderTable(slots.ledger, [
      { label: '数量', value: function (row) { return formatNumber(row.amount) || cell(row.amount); } },
      { label: '余额', value: function (row) { return formatNumber(row.balance_after) || cell(row.balance_after); } },
      { label: '类型', value: function (row) { return cell(row.type); } },
      { label: '备注', value: function (row) { return cell(row.remark); } },
      { label: '时间', value: function (row) { return cell(row.created_at); } },
    ], result.data.data, '没有流水');
  }

  async function loadSession() {
    showAlert('');
    const profile = await request('/api/auth/profile');
    if (profile.res.status === 401) {
      setToken('');
      showLoggedOut();
      showAlert(errorMessage(profile, '登录态已失效'));
      return;
    }
    if (!profile.res.ok || !profile.data || !profile.data.user) {
      showLoggedIn();
      clearSlots();
      showAlert(errorMessage(profile, '无法获取资料'));
      return;
    }
    const user = profile.data.user;
    showLoggedIn();
    renderProfile(user);
    renderBalance(user);
    renderKey(user);
    const plans = await request('/api/plans');
    const orders = await request('/api/auth/orders');
    const ledger = await request('/api/auth/quota/logs');
    renderPlan(user, plans);
    renderOrders(orders);
    renderLedger(ledger);
  }

  async function submitAuth(path, body) {
    showAlert('');
    const result = await request(path, { method: 'POST', body: body });
    if (!result.res.ok || !result.data || !result.data.token) {
      showAlert(errorMessage(result, '账号请求失败'));
      return;
    }
    setToken(result.data.token);
    await loadSession();
  }

  document.getElementById('login-form').addEventListener('submit', function (event) {
    event.preventDefault();
    const account = document.getElementById('login-account').value.trim();
    const password = document.getElementById('login-password').value;
    if (!account || !password) {
      showAlert('请输入账号与密码');
      return;
    }
    submitAuth('/api/auth/login', { account: account, password: password });
  });

  document.getElementById('register-form').addEventListener('submit', function (event) {
    event.preventDefault();
    const account = document.getElementById('register-account').value.trim();
    const password = document.getElementById('register-password').value;
    const nickname = document.getElementById('register-nickname').value.trim();
    if (!account || !password) {
      showAlert('请输入账号与密码');
      return;
    }
    if (password.length < 6) {
      showAlert('密码长度至少为 6 位');
      return;
    }
    const body = { password: password };
    if (nickname) body.nickname = nickname;
    if (account.indexOf('@') >= 0) body.email = account;
    else body.phone = account;
    submitAuth('/api/auth/register', body);
  });

  document.getElementById('btn-refresh').addEventListener('click', function () {
    loadSession();
  });

  document.getElementById('btn-logout').addEventListener('click', function () {
    setToken('');
    showAlert('');
    showLoggedOut();
  });

  if (token()) loadSession();
  else showLoggedOut();
})();

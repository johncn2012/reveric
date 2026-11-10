/**
 * 同域账号中心。未登录只提交登录和注册；登录后只渲染接口返回的字段。
 * 规范路径：POST /api/auth/login、POST /api/auth/register、GET /api/auth/profile、
 * GET /api/auth/orders、GET /api/auth/quota/logs。套餐名称来自 GET /api/plans。
 * 管理员另读 /api/admin/overview、/api/admin/users、/api/admin/orders、/api/health、
 * /api/updates/latest。不创建订单，也不展示金额汇总。
 */
(function () {
  const TOKEN_KEY = 'metaarc_account_token';
  const USER_VIEWS = ['overview', 'projects', 'quota', 'billing'];
  const ADMIN_VIEWS = ['users', 'tasks', 'media', 'orders', 'health', 'updates'];
  const alertEl = document.getElementById('alert');
  const gate = document.getElementById('gate');
  const consoleEl = document.getElementById('console');
  const adminNav = document.getElementById('admin-nav');
  const gateTitle = document.getElementById('gate-title');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const forgotPanel = document.getElementById('forgot-panel');
  const loginLinks = document.getElementById('login-links');
  let currentUser = null;
  let busy = false;
  let alertTimer = null;

  function showAlert(message, isSuccess) {
    if (alertTimer) {
      clearTimeout(alertTimer);
      alertTimer = null;
    }
    if (!message) {
      alertEl.hidden = true;
      alertEl.textContent = '';
      alertEl.classList.remove('alert-success');
      return;
    }
    alertEl.hidden = false;
    alertEl.textContent = message;
    if (isSuccess) {
      alertEl.classList.add('alert-success');
      alertTimer = setTimeout(function () {
        showAlert('');
      }, 4000);
    } else {
      alertEl.classList.remove('alert-success');
    }
  }

  if (alertEl) {
    alertEl.addEventListener('click', function () {
      showAlert('');
    });
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

  function showLoggedOut() {
    gate.hidden = false;
    consoleEl.hidden = true;
    currentUser = null;
    adminNav.hidden = true;
  }

  function showLoggedIn() {
    gate.hidden = true;
    consoleEl.hidden = false;
  }

  function showGateMode(mode) {
    const login = mode === 'login';
    loginForm.hidden = !login;
    loginLinks.hidden = !login;
    registerForm.hidden = mode !== 'register';
    forgotPanel.hidden = mode !== 'forgot';
    gateTitle.textContent = mode === 'register' ? '注册账号' : '进入创作台';
    showAlert('');
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
    if (!Number.isFinite(amount)) return '';
    const yuan = amount / 100;
    const text = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
    return '¥' + text;
  }

  function formatWhen(value) {
    if (value === undefined || value === null || value === '') return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const pad = function (n) { return String(n).padStart(2, '0'); };
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
      + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  function roleLabel(role) {
    if (role === 'admin') return '管理员';
    if (role === 'user') return '用户';
    return role ? String(role) : '';
  }

  function statusLabel(status) {
    if (status === 'paid') return '已记录';
    if (status === 'pending') return '未完成';
    if (status === 'failed' || status === 'cancelled' || status === 'canceled') return '未完成';
    return status ? String(status) : '';
  }

  function formatBytes(bytes) {
    const b = Number(bytes);
    if (!Number.isFinite(b) || b <= 0) return '0 B';
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
    return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function assetTypeLabel(type) {
    if (type === 'image') return '图片/分镜';
    if (type === 'video') return '成片视频';
    if (type === 'audio') return '音频/配音';
    if (type === 'export') return '交付导出包';
    return type ? String(type) : '媒体';
  }

  function taskTypeLabel(type) {
    if (type === 'chapter_illustrations') return '章节绘图';
    if (type === 'batch_dubbing') return '批量配音';
    if (type === 'video_render') return '分镜渲染';
    if (type === 'character_profile') return '角色肖像';
    return type ? String(type) : '通用任务';
  }

  function taskStatusLabel(status) {
    if (status === 'pending') return '排队中';
    if (status === 'running' || status === 'processing') return '运行中';
    if (status === 'completed') return '已完成';
    if (status === 'failed') return '失败';
    if (status === 'cancelled') return '已取消';
    return status ? String(status) : '未知';
  }

  function progressBar(percent) {
    const val = Math.max(0, Math.min(100, Number(percent) || 0));
    const wrap = document.createElement('div');
    wrap.className = 'progress-bar-inline';
    const track = document.createElement('div');
    track.className = 'progress-track-mini';
    const fill = document.createElement('div');
    fill.className = 'progress-fill-mini';
    fill.style.width = val + '%';
    track.append(fill);
    const span = document.createElement('span');
    span.style.fontSize = '12px';
    span.style.color = '#c4c6ce';
    span.textContent = val + '%';
    wrap.append(track, span);
    return wrap;
  }

  function personLabel(row) {
    if (!row) return '';
    if (row.email) return String(row.email);
    if (row.phone) return String(row.phone);
    if (row.nickname) return String(row.nickname);
    return '';
  }

  function renderProfile(user) {
    const dl = document.getElementById('profile-fields');
    dl.replaceChildren();
    addField(dl, '昵称', user.nickname);
    addField(dl, '邮箱', user.email);
    addField(dl, '手机', user.phone);
    addField(dl, '角色', roleLabel(user.role));
    addField(dl, '套餐', user.plan);
    addField(dl, '到期', formatWhen(user.expires_at));
    document.getElementById('who-name').textContent = user.nickname || user.email || user.phone || '已登录';
    document.getElementById('who-role').textContent = roleLabel(user.role);
  }

  function meter(label, value, total, detail) {
    const wrap = document.createElement('div');
    wrap.className = 'meter';
    const row = document.createElement('div');
    row.className = 'meter-row';
    const name = document.createElement('span');
    name.textContent = label;
    const note = document.createElement('span');
    note.textContent = detail;
    row.append(name, note);
    const track = document.createElement('div');
    track.className = 'meter-track';
    const fill = document.createElement('div');
    fill.className = 'meter-fill';
    const width = total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
    fill.style.width = width + '%';
    track.append(fill);
    wrap.append(row, track);
    return wrap;
  }

  function renderMeters(user) {
    const nodes = [document.getElementById('overview-meters'), document.getElementById('quota-meters')];
    const total = Number(user.total_quota);
    const remain = Number(user.quota);
    nodes.forEach(function (slot) {
      slot.replaceChildren();
      if (!Number.isFinite(total) && !Number.isFinite(remain)) {
        const empty = document.createElement('p');
        empty.className = 'empty';
        empty.textContent = '资料接口没有返回配额。';
        slot.append(empty);
        return;
      }
      const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
      const safeRemain = Number.isFinite(remain) && remain > 0 ? remain : 0;
      const used = safeTotal > 0 ? Math.max(0, safeTotal - safeRemain) : 0;
      const remainText = formatNumber(safeRemain) + (safeTotal ? ' / ' + formatNumber(safeTotal) : '');
      slot.append(
        meter('剩余点数', safeRemain, safeTotal, remainText),
        meter('已用点数', used, safeTotal, formatNumber(used) || '0')
      );
    });
  }

  function renderKey(user) {
    const slot = document.getElementById('key-slot');
    slot.replaceChildren();
    const key = typeof user.new_api_key === 'string' ? user.new_api_key.trim() : '';
    const base = typeof user.new_api_base_url === 'string' ? user.new_api_base_url.trim() : '';
    const note = document.createElement('p');
    note.className = 'empty';
    if (!key || key.indexOf('sk-mock-') === 0) {
      note.textContent = '算力通道尚未开通，接口没有返回可用密钥。';
      const genBtn = document.createElement('button');
      genBtn.className = 'action-btn primary';
      genBtn.type = 'button';
      genBtn.style.marginTop = '8px';
      genBtn.textContent = '签发算力密钥';
      genBtn.addEventListener('click', async function () {
        genBtn.disabled = true;
        genBtn.textContent = '签发中…';
        try {
          const res = await request('/api/auth/reset-api-key', { method: 'POST' });
          if (res.res.ok && res.data && res.data.success && res.data.new_api_key) {
            currentUser.new_api_key = res.data.new_api_key;
            notify('算力密钥已成功签发', 'success');
            renderKey(currentUser);
          } else {
            notify(errorMessage(res, '签发密钥失败'), 'error');
            genBtn.disabled = false;
            genBtn.textContent = '签发算力密钥';
          }
        } catch (_) {
          notify('网络异常，请稍后重试', 'error');
          genBtn.disabled = false;
          genBtn.textContent = '签发算力密钥';
        }
      });
      slot.append(note, genBtn);
    } else {
      const codeRow = document.createElement('div');
      codeRow.className = 'form-row';
      const code = document.createElement('p');
      code.className = 'mono';
      code.textContent = key;
      code.style.margin = '0';
      const copyBtn = document.createElement('button');
      copyBtn.className = 'action-btn';
      copyBtn.type = 'button';
      copyBtn.textContent = '复制密钥';
      copyBtn.addEventListener('click', function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(key).then(function () {
            copyBtn.textContent = '已复制！';
            setTimeout(function () { copyBtn.textContent = '复制密钥'; }, 2000);
          }).catch(function () {
            prompt('请手动复制密钥：', key);
          });
        } else {
          prompt('请手动复制密钥：', key);
        }
      });
      const resetBtn = document.createElement('button');
      resetBtn.className = 'action-btn';
      resetBtn.type = 'button';
      resetBtn.textContent = '重置密钥';
      resetBtn.addEventListener('click', async function () {
        if (!confirm('确定要重置当前算力密钥吗？重置后旧密钥将立即失效，需在本地客户端更新配置。')) return;
        resetBtn.disabled = true;
        resetBtn.textContent = '重置中…';
        try {
          const res = await request('/api/auth/reset-api-key', { method: 'POST' });
          if (res.res.ok && res.data && res.data.success && res.data.new_api_key) {
            currentUser.new_api_key = res.data.new_api_key;
            notify('密钥已重新生成并生效', 'success');
            renderKey(currentUser);
          } else {
            notify(errorMessage(res, '重置密钥失败'), 'error');
            resetBtn.disabled = false;
            resetBtn.textContent = '重置密钥';
          }
        } catch (_) {
          notify('网络异常，请稍后重试', 'error');
          resetBtn.disabled = false;
          resetBtn.textContent = '重置密钥';
        }
      });
      codeRow.append(code, copyBtn, resetBtn);
      slot.append(codeRow);
    }
    if (base) {
      const line = document.createElement('p');
      line.className = 'empty';
      line.textContent = '算力地址：' + base;
      slot.append(line);
    }
  }

  function cycleSuffix(cycle) {
    if (cycle === 'monthly') return ' / 月';
    if (cycle === 'yearly') return ' / 年';
    if (typeof cycle === 'string' && cycle.trim()) return ' / ' + cycle.trim();
    return '';
  }

  function renderPlan(user, plansResult) {
    const slot = document.getElementById('plan-slot');
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
    if (price) addField(dl, '标价', price + cycleSuffix(match.billing_cycle));
    const points = formatNumber(match.quota_points);
    if (points) addField(dl, '点数', points);
    const closed = document.createElement('p');
    closed.className = 'fine';
    closed.textContent = '支付尚未开通，不能购买这个套餐。';
    slot.append(dl, closed);
  }

  function cell(value) {
    if (value === undefined || value === null || value === '') return '';
    return String(value);
  }

  function renderTable(slot, columns, rows) {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
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
        column.fill(td, row);
        tr.append(td);
      });
      tbody.append(tr);
    });
    table.append(thead, tbody);
    wrap.append(table);
    slot.append(wrap);
  }

  function renderOrderTable(slot, rows, withUser) {
    slot.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-well';
      empty.textContent = '暂无订单 · 支付未开通';
      slot.append(empty);
      return;
    }
    const columns = [];
    if (withUser) columns.push({ label: '用户', fill: function (td, row) { td.textContent = personLabel(row); } });
    columns.push(
      { label: '套餐', fill: function (td, row) { td.textContent = cell(row.plan_name || row.plan_slug); } },
      { label: '金额', fill: function (td, row) { td.textContent = formatCents(row.amount_cents); } },
      { label: '点数', fill: function (td, row) { td.textContent = formatNumber(row.quota_points) || ''; } },
      { label: '状态', fill: function (td, row) { td.textContent = statusLabel(row.status); } },
      { label: '创建', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } }
    );
    renderTable(slot, columns, rows);
  }

  function renderOrders(slot, result, withUser) {
    if (!result.res.ok || !result.data || result.data.success !== true || !Array.isArray(result.data.data)) {
      slot.replaceChildren();
      const note = document.createElement('p');
      note.className = 'empty';
      note.textContent = errorMessage(result, '无法获取订单');
      slot.append(note);
      return;
    }
    renderOrderTable(slot, result.data.data, withUser);
  }

  function renderLedger(result) {
    const slot = document.getElementById('ledger-slot');
    if (!result.res.ok || !result.data || result.data.success !== true || !Array.isArray(result.data.data)) {
      slot.replaceChildren();
      const note = document.createElement('p');
      note.className = 'empty';
      note.textContent = errorMessage(result, '无法获取流水');
      slot.append(note);
      return;
    }
    if (!result.data.data.length) {
      slot.replaceChildren();
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = '没有点数流水。';
      slot.append(empty);
      return;
    }
    slot.replaceChildren();
    renderTable(slot, [
      { label: '点数', fill: function (td, row) { td.textContent = formatNumber(row.amount) || cell(row.amount); } },
      { label: '余额', fill: function (td, row) { td.textContent = formatNumber(row.balance_after) || cell(row.balance_after); } },
      { label: '类型', fill: function (td, row) { td.textContent = cell(row.type); } },
      { label: '备注', fill: function (td, row) { td.textContent = cell(row.remark); } },
      { label: '时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
    ], result.data.data);
  }

  function setKpi(id, value) {
    const el = document.getElementById(id);
    el.textContent = value === null || value === undefined ? '—' : String(value);
  }

  function renderOverview(result) {
    const note = document.getElementById('kpi-note');
    if (!result.res.ok || !result.data || result.data.success !== true || !result.data.data) {
      setKpi('kpi-users', '—');
      setKpi('kpi-new', '—');
      setKpi('kpi-tasks', '—');
      note.hidden = false;
      note.textContent = errorMessage(result, '运营数据暂时无法读取');
      return;
    }
    const data = result.data.data;
    setKpi('kpi-users', formatNumber(data.total_users) || '—');
    setKpi('kpi-new', formatNumber(data.today_new_users) || '—');
    setKpi('kpi-tasks', formatNumber(data.active_tasks) || '—');
    note.hidden = true;
    note.textContent = '';
  }

  const modalOverlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const modalClose = document.getElementById('modal-close');

  function openModal(title, contentNode) {
    if (!modalOverlay || !modalTitle || !modalBody) return;
    modalTitle.textContent = title;
    modalBody.replaceChildren(contentNode);
    modalOverlay.hidden = false;
  }

  function closeModal() {
    if (!modalOverlay || !modalBody) return;
    modalOverlay.hidden = true;
    modalBody.replaceChildren();
  }

  if (modalClose) modalClose.addEventListener('click', closeModal);
  if (modalOverlay) {
    modalOverlay.addEventListener('click', function (e) {
      if (e.target === modalOverlay) closeModal();
    });
  }

  function renderUsers(result) {
    const slot = document.getElementById('users-slot');
    slot.replaceChildren();
    if (!result.res.ok || !result.data || result.data.success !== true || !Array.isArray(result.data.data)) {
      const note = document.createElement('p');
      note.className = 'empty';
      note.textContent = errorMessage(result, '无法获取用户');
      slot.append(note);
      return;
    }
    if (!result.data.data.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = '没有匹配的用户。';
      slot.append(empty);
      return;
    }
    renderTable(slot, [
      { label: '用户标识', fill: function (td, row) { td.textContent = personLabel(row) || '—'; } },
      {
        label: '角色/状态',
        fill: function (td, row) {
          const isSuspended = row.status === 'suspended';
          const dot = document.createElement('i');
          dot.className = isSuspended ? 'dot warn' : (row.role === 'admin' ? 'dot warn' : 'dot');
          const statusPrefix = isSuspended ? '已封禁 · ' : '';
          td.append(dot, document.createTextNode(statusPrefix + roleLabel(row.role) + (row.plan ? ' · ' + row.plan : '')));
        },
      },
      { label: '配额', fill: function (td, row) { td.textContent = formatNumber(row.quota) || cell(row.quota); } },
      { label: '注册时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
      {
        label: '管理操作',
        fill: function (td, row) {
          const btnQuota = document.createElement('button');
          btnQuota.className = 'action-btn primary';
          btnQuota.type = 'button';
          btnQuota.textContent = '调账';
          btnQuota.addEventListener('click', async function () {
            const raw = prompt('请输入给用户「' + (personLabel(row) || row.id) + '」调整的算力点数（正数加点，负数扣点）：', '500');
            if (raw === null) return;
            const amount = parseFloat(raw.trim());
            if (!Number.isFinite(amount) || amount === 0) {
              alert('请输入有效的非零数值');
              return;
            }
            const reason = prompt('请输入调账原因或备注：', '管理员手工调账') || '';
            const res = await request('/api/admin/users/' + row.id + '/adjust-quota', {
              method: 'POST',
              body: { amount: amount, reason: reason },
            });
            if (res.res.ok && res.data && res.data.success) {
              showAlert('调账成功！用户新余额：' + res.data.user.quota);
              loadUsers(document.getElementById('user-keyword').value.trim());
            } else {
              showAlert(errorMessage(res, '调账失败'));
            }
          });

          const btnPlan = document.createElement('button');
          btnPlan.className = 'action-btn';
          btnPlan.type = 'button';
          btnPlan.textContent = '套餐';
          btnPlan.addEventListener('click', async function () {
            const rawPlan = prompt('请选择新套餐（free / creator / pro / studio）：', row.plan || 'free');
            if (!rawPlan) return;
            const newPlan = rawPlan.trim().toLowerCase();
            if (['free', 'creator', 'pro', 'studio'].indexOf(newPlan) < 0) {
              alert('无效套餐标识，只能填 free / creator / pro / studio');
              return;
            }
            const res = await request('/api/admin/users/' + row.id + '/set-plan', {
              method: 'POST',
              body: { plan: newPlan },
            });
            if (res.res.ok && res.data && res.data.success) {
              showAlert('套餐设置成功！');
              loadUsers(document.getElementById('user-keyword').value.trim());
            } else {
              showAlert(errorMessage(res, '套餐设置失败'));
            }
          });

          const btnLogs = document.createElement('button');
          btnLogs.className = 'action-btn';
          btnLogs.type = 'button';
          btnLogs.textContent = '流水';
          btnLogs.addEventListener('click', async function () {
            const res = await request('/api/admin/users/' + row.id + '/quota-logs');
            if (!res.res.ok || !res.data || !res.data.success) {
              showAlert(errorMessage(res, '无法获取流水记录'));
              return;
            }
            const logs = Array.isArray(res.data.data) ? res.data.data : [];
            const container = document.createElement('div');
            if (!logs.length) {
              const p = document.createElement('p');
              p.className = 'empty';
              p.textContent = '该用户暂无配额流水记录。';
              container.append(p);
            } else {
              renderTable(container, [
                { label: '变动点数', fill: function (td, log) { td.textContent = formatNumber(log.amount) || cell(log.amount); } },
                { label: '变动后余额', fill: function (td, log) { td.textContent = formatNumber(log.balance_after) || cell(log.balance_after); } },
                { label: '类型', fill: function (td, log) { td.textContent = cell(log.type); } },
                { label: '备注', fill: function (td, log) { td.textContent = cell(log.remark); } },
                { label: '时间', fill: function (td, log) { td.textContent = formatWhen(log.created_at); } },
              ], logs);
            }
            openModal('用户算力流水 — ' + (personLabel(row) || row.id), container);
          });

          const btnReset = document.createElement('button');
          btnReset.className = 'action-btn';
          btnReset.type = 'button';
          btnReset.textContent = '重置密码';
          btnReset.addEventListener('click', async function () {
            if (!confirm('确定要重置用户「' + (personLabel(row) || row.id) + '」的密码吗？')) return;
            const res = await request('/api/admin/users/' + row.id + '/reset-password', { method: 'POST' });
            if (res.res.ok && res.data && res.data.success) {
              const tempPwd = res.data.temporary_password || res.data.newPassword;
              prompt('密码已重置！请妥善保存临时密码并通知用户：', tempPwd);
            } else {
              showAlert(errorMessage(res, '密码重置失败'));
            }
          });

          const isSuspended = row.status === 'suspended';
          const btnStatus = document.createElement('button');
          btnStatus.className = isSuspended ? 'action-btn primary' : 'action-btn';
          btnStatus.type = 'button';
          btnStatus.textContent = isSuspended ? '解封' : '封禁';
          btnStatus.addEventListener('click', async function () {
            const nextStatus = isSuspended ? 'active' : 'suspended';
            const actionText = isSuspended ? '解封' : '封禁';
            if (!confirm('确定要' + actionText + '用户「' + (personLabel(row) || row.id) + '」吗？')) return;
            const res = await request('/api/admin/users/' + row.id + '/set-status', {
              method: 'POST',
              body: { status: nextStatus },
            });
            if (res.res.ok && res.data && res.data.success) {
              showAlert('用户状态已变更为：' + (nextStatus === 'active' ? '正常' : '已封禁'));
              loadUsers(document.getElementById('user-keyword').value.trim());
            } else {
              showAlert(errorMessage(res, '更新用户状态失败'));
            }
          });

          const btnDetails = document.createElement('button');
          btnDetails.className = 'action-btn';
          btnDetails.type = 'button';
          btnDetails.textContent = '详情';
          btnDetails.addEventListener('click', function () {
            const wrap = document.createElement('div');
            const dl = document.createElement('dl');
            addField(dl, '用户 ID', row.id);
            addField(dl, '登录邮箱', row.email || '—');
            addField(dl, '绑定手机', row.phone || '—');
            addField(dl, '创作者昵称', row.nickname || '—');
            addField(dl, '角色权限', roleLabel(row.role));
            addField(dl, '账号状态', row.status === 'suspended' ? '已封禁' : '正常');
            addField(dl, '当前套餐', row.plan || 'free');
            addField(dl, '可用算力', formatNumber(row.quota) || cell(row.quota));
            addField(dl, '累计配额', formatNumber(row.total_quota) || cell(row.total_quota));
            if (row.new_api_key) addField(dl, '算力 Key', row.new_api_key.substring(0, 12) + '******');
            addField(dl, '注册时间', formatWhen(row.created_at));
            wrap.append(dl);
            openModal('创作者档案 — ' + (personLabel(row) || row.id), wrap);
          });

          td.append(btnDetails, btnQuota, btnPlan, btnLogs, btnReset, btnStatus);
        },
      },
    ], result.data.data);
  }

  function renderHealth(healthResult, sysResult) {
    const slot = document.getElementById('health-slot');
    slot.replaceChildren();
    const ok = healthResult && healthResult.res.ok && healthResult.data && healthResult.data.status === 'ok';
    const dl = document.createElement('dl');
    addField(dl, '基础服务', ok ? '正常运行' : '不可用');
    addField(dl, '数据库连接', ok && healthResult.data.db === 'connected' ? '已连接' : '未连接');
    if (healthResult && healthResult.data && healthResult.data.timestamp) {
      addField(dl, '探针时间', formatWhen(healthResult.data.timestamp));
    }

    if (sysResult && sysResult.res.ok && sysResult.data && sysResult.data.success && sysResult.data.data) {
      const sys = sysResult.data.data;
      addField(dl, '主机平台', (sys.platform || '') + ' ' + (sys.arch || '') + ' (Node ' + (sys.node_version || '') + ')');
      addField(dl, '运行时间', sys.uptime_formatted);
      if (sys.memory_mb) {
        addField(dl, '内存使用', '物理占用 ' + sys.memory_mb.rss + ' MB / 堆内存已用 ' + sys.memory_mb.heap_used + ' MB');
      }
      if (sys.db_pool) {
        addField(dl, '连接池状态', '总计 ' + sys.db_pool.total + ' / 空闲 ' + sys.db_pool.idle + ' / 等待 ' + sys.db_pool.waiting);
      }
      if (sys.ai_gateway) {
        const gwText = sys.ai_gateway.status === 'connected'
          ? '正常 (已连接)'
          : (sys.ai_gateway.configured ? '离线 (' + sys.ai_gateway.status + ')' : '未配置');
        addField(dl, 'AI 算力通道', gwText);
      }
      if (sys.s3) {
        const s3Text = sys.s3.configured
          ? '已就绪 (桶: ' + sys.s3.bucket + ' · ' + sys.s3.region + ')'
          : '默认离线 (桶: ' + sys.s3.bucket + ')';
        addField(dl, '对象存储 (S3)', s3Text);
      }
    }

    slot.append(dl);
    if (!ok) {
      const note = document.createElement('p');
      note.className = 'empty';
      note.textContent = '健康探针没有返回可用状态。';
      slot.append(note);
    }
  }

  function updateLabel(data) {
    if (!data || data.has_update !== true) {
      return (data && typeof data.message === 'string' && data.message.trim()) ? data.message.trim() : '尚未发布';
    }
    const parts = [];
    if (data.version) parts.push('版本 ' + data.version);
    if (data.channel) parts.push(data.channel);
    if (data.file_size) parts.push(formatBytes(data.file_size));
    return parts.length ? parts.join(' · ') : '清单返回了更新';
  }

  function renderUpdates(rows) {
    const slot = document.getElementById('updates-slot');
    slot.replaceChildren();
    const dl = document.createElement('dl');
    rows.forEach(function (row) {
      const dt = document.createElement('dt');
      dt.textContent = row.name;
      const dd = document.createElement('dd');
      const textSpan = document.createElement('span');
      textSpan.textContent = row.ok ? updateLabel(row.data) : '清单暂时无法读取';
      dd.append(textSpan);
      if (row.ok && row.data && row.data.download_url) {
        const dlLink = document.createElement('a');
        dlLink.className = 'action-btn primary';
        dlLink.style.marginLeft = '12px';
        dlLink.href = row.data.download_url;
        dlLink.target = '_blank';
        dlLink.rel = 'noopener noreferrer';
        dlLink.textContent = '下载安装包';
        dd.append(dlLink);
      }
      dl.append(dt, dd);
    });
    slot.append(dl);
  }

  function renderUserTasks(result) {
    const slot = document.getElementById('user-tasks-slot');
    if (!slot) return;
    slot.replaceChildren();
    if (!result.res.ok || !result.data || result.data.success !== true || !Array.isArray(result.data.data)) {
      const note = document.createElement('p');
      note.className = 'empty';
      note.textContent = errorMessage(result, '无法获取创作任务记录');
      slot.append(note);
      return;
    }
    if (!result.data.data.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = '暂无云端 AI 渲染任务，在桌面端发起生成后将在此展示进度。';
      slot.append(empty);
      return;
    }
    renderTable(slot, [
      { label: '任务类型', fill: function (td, row) { td.textContent = taskTypeLabel(row.task_type); } },
      { label: '进度', fill: function (td, row) { td.append(progressBar(row.progress)); } },
      {
        label: '状态',
        fill: function (td, row) {
          const dot = document.createElement('i');
          dot.className = row.status === 'failed' ? 'dot warn' : (row.status === 'completed' ? 'dot' : 'dot warn');
          td.append(dot, document.createTextNode(taskStatusLabel(row.status)));
        },
      },
      { label: '创建时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
      {
        label: '操作',
        fill: function (td, row) {
          if (row.status === 'pending' || row.status === 'running' || row.status === 'processing') {
            const btnCancel = document.createElement('button');
            btnCancel.className = 'action-btn danger';
            btnCancel.type = 'button';
            btnCancel.textContent = '取消';
            btnCancel.addEventListener('click', async function () {
              if (!confirm('确定要取消该任务吗？')) return;
              btnCancel.disabled = true;
              btnCancel.textContent = '取消中…';
              try {
                const res = await request('/api/tasks/' + encodeURIComponent(row.id) + '/cancel', { method: 'POST' });
                if (res.res.ok && res.data && res.data.success) {
                  notify('任务已取消', 'success');
                  const refreshed = await request('/api/tasks/list');
                  renderUserTasks(refreshed);
                } else {
                  notify(errorMessage(res, '取消任务失败'), 'error');
                  btnCancel.disabled = false;
                  btnCancel.textContent = '取消';
                }
              } catch (_) {
                notify('网络异常，请稍后重试', 'error');
                btnCancel.disabled = false;
                btnCancel.textContent = '取消';
              }
            });
            td.append(btnCancel);
          } else {
            const btnDel = document.createElement('button');
            btnDel.className = 'action-btn';
            btnDel.type = 'button';
            btnDel.textContent = '清除';
            btnDel.addEventListener('click', async function () {
              if (!confirm('确定清除该任务历史记录吗？')) return;
              btnDel.disabled = true;
              btnDel.textContent = '清除中…';
              try {
                const res = await request('/api/tasks/' + encodeURIComponent(row.id), { method: 'DELETE' });
                if (res.res.ok && res.data && res.data.success) {
                  notify('任务记录已清除', 'success');
                  const refreshed = await request('/api/tasks/list');
                  renderUserTasks(refreshed);
                } else {
                  notify(errorMessage(res, '清除失败'), 'error');
                  btnDel.disabled = false;
                  btnDel.textContent = '清除';
                }
              } catch (_) {
                notify('网络异常，请稍后重试', 'error');
                btnDel.disabled = false;
                btnDel.textContent = '清除';
              }
            });
            td.append(btnDel);
          }
          if (row.error_message) {
            const btnErr = document.createElement('button');
            btnErr.className = 'action-btn';
            btnErr.type = 'button';
            btnErr.textContent = '原因';
            btnErr.style.marginLeft = '4px';
            btnErr.addEventListener('click', function () {
              const p = document.createElement('p');
              p.style.whiteSpace = 'pre-wrap';
              p.style.color = '#ff8566';
              p.textContent = row.error_message;
              openModal('任务异常信息 — ' + row.id, p);
            });
            td.append(btnErr);
          }
        },
      },
    ], result.data.data);
  }

  function renderAdminTasks(result) {
    const slot = document.getElementById('admin-tasks-slot');
    if (!slot) return;
    slot.replaceChildren();
    if (!result.res.ok || !result.data || result.data.success !== true || !Array.isArray(result.data.data)) {
      const note = document.createElement('p');
      note.className = 'empty';
      note.textContent = errorMessage(result, '无法获取任务调度队列');
      slot.append(note);
      return;
    }
    if (!result.data.data.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = '当前没有匹配的任务。';
      slot.append(empty);
      return;
    }
    renderTable(slot, [
      { label: '任务类型', fill: function (td, row) { td.textContent = taskTypeLabel(row.task_type); } },
      { label: '所属用户', fill: function (td, row) { td.textContent = personLabel(row) || '—'; } },
      { label: '进度', fill: function (td, row) { td.append(progressBar(row.progress)); } },
      {
        label: '状态',
        fill: function (td, row) {
          const dot = document.createElement('i');
          dot.className = row.status === 'failed' ? 'dot warn' : (row.status === 'completed' ? 'dot' : 'dot warn');
          td.append(dot, document.createTextNode(taskStatusLabel(row.status)));
        },
      },
      { label: '创建时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
      {
        label: '操作',
        fill: function (td, row) {
          if (row.status === 'pending' || row.status === 'running' || row.status === 'processing') {
            const btnCancel = document.createElement('button');
            btnCancel.className = 'action-btn danger';
            btnCancel.type = 'button';
            btnCancel.textContent = '终止';
            btnCancel.addEventListener('click', async function () {
              if (!confirm('确定要终止任务「' + row.id + '」吗？')) return;
              btnCancel.disabled = true;
              btnCancel.textContent = '终止中…';
              try {
                const res = await request('/api/admin/tasks/' + encodeURIComponent(row.id) + '/cancel', { method: 'POST' });
                if (res.res.ok && res.data && res.data.success) {
                  notify('任务已成功终止', 'success');
                  await loadAdminTasks(currentTaskFilter);
                } else {
                  notify(errorMessage(res, '终止任务失败'), 'error');
                  btnCancel.disabled = false;
                  btnCancel.textContent = '终止';
                }
              } catch (_) {
                notify('网络异常，请稍后重试', 'error');
                btnCancel.disabled = false;
                btnCancel.textContent = '终止';
              }
            });
            td.append(btnCancel);
          }
          const btnDel = document.createElement('button');
          btnDel.className = 'action-btn danger';
          btnDel.type = 'button';
          btnDel.textContent = '删除';
          btnDel.addEventListener('click', async function () {
            if (!confirm('确定从全平台删除任务记录「' + row.id + '」吗？')) return;
            btnDel.disabled = true;
            btnDel.textContent = '删除中…';
            try {
              const res = await request('/api/admin/tasks/' + encodeURIComponent(row.id), { method: 'DELETE' });
              if (res.res.ok && res.data && res.data.success) {
                notify('任务记录已删除', 'success');
                await loadAdminTasks(currentTaskFilter);
              } else {
                notify(errorMessage(res, '删除任务失败'), 'error');
                btnDel.disabled = false;
                btnDel.textContent = '删除';
              }
            } catch (_) {
              notify('网络异常，请稍后重试', 'error');
              btnDel.disabled = false;
              btnDel.textContent = '删除';
            }
          });
          td.append(btnDel);

          if (row.error_message) {
            const btnErr = document.createElement('button');
            btnErr.className = 'action-btn';
            btnErr.type = 'button';
            btnErr.textContent = '查看原因';
            btnErr.addEventListener('click', function () {
              const p = document.createElement('p');
              p.style.whiteSpace = 'pre-wrap';
              p.style.color = '#ff8566';
              p.textContent = row.error_message;
              openModal('任务异常信息 — ' + row.id, p);
            });
            td.append(btnErr);
          }
        },
      },
    ], result.data.data);
  }

  function renderUserMedia(result) {
    const slot = document.getElementById('user-media-slot');
    if (!slot) return;
    slot.replaceChildren();
    if (!result.res.ok || !result.data || result.data.success !== true || !Array.isArray(result.data.data)) {
      const note = document.createElement('p');
      note.className = 'empty';
      note.textContent = errorMessage(result, '无法获取媒体交付物列表');
      slot.append(note);
      return;
    }
    if (!result.data.data.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = '暂无云端媒体交付物。小说分镜成片导出后将归档至此。';
      slot.append(empty);
      return;
    }
    renderTable(slot, [
      { label: '交付物类型', fill: function (td, row) { td.textContent = assetTypeLabel(row.asset_type); } },
      { label: '格式/类型', fill: function (td, row) { td.textContent = cell(row.mime_type || row.asset_type); } },
      { label: '大小', fill: function (td, row) { td.textContent = formatBytes(row.byte_size); } },
      { label: '归档时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
      {
        label: '操作',
        fill: function (td, row) {
          if (row.cdn_url) {
            const link = document.createElement('a');
            link.className = 'action-btn';
            link.href = row.cdn_url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = '查看/下载';
            td.append(link);
          }
          const delBtn = document.createElement('button');
          delBtn.className = 'action-btn danger';
          delBtn.type = 'button';
          delBtn.textContent = '删除';
          delBtn.addEventListener('click', async function () {
            if (!confirm('确定要删除此媒体交付物吗？删除后将无法恢复。')) return;
            delBtn.disabled = true;
            delBtn.textContent = '删除中…';
            try {
              const res = await request('/api/media/' + encodeURIComponent(row.id), { method: 'DELETE' });
              if (res.res.ok && res.data && res.data.success) {
                notify('媒体资产已删除', 'success');
                const refreshed = await request('/api/media/list');
                renderUserMedia(refreshed);
              } else {
                notify(errorMessage(res, '删除失败'), 'error');
                delBtn.disabled = false;
                delBtn.textContent = '删除';
              }
            } catch (_) {
              notify('网络异常，请稍后重试', 'error');
              delBtn.disabled = false;
              delBtn.textContent = '删除';
            }
          });
          td.append(delBtn);
        },
      },
    ], result.data.data);
  }

  function renderAdminMedia(result) {
    const slot = document.getElementById('admin-media-slot');
    if (!slot) return;
    slot.replaceChildren();
    if (!result.res.ok || !result.data || result.data.success !== true) {
      const note = document.createElement('p');
      note.className = 'empty';
      note.textContent = errorMessage(result, '无法获取媒体资源列表');
      slot.append(note);
      return;
    }
    const stats = result.data.stats || {};
    const rows = Array.isArray(result.data.data) ? result.data.data : [];

    setKpi('kpi-media-count', formatNumber(stats.total_assets) || '0');
    setKpi('kpi-media-size', formatBytes(stats.total_bytes));
    setKpi('kpi-media-users', formatNumber(stats.total_users) || '0');

    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = '当前没有匹配的媒体资产。';
      slot.append(empty);
      return;
    }
    renderTable(slot, [
      { label: '资产类型', fill: function (td, row) { td.textContent = assetTypeLabel(row.asset_type); } },
      { label: '归属创作者', fill: function (td, row) { td.textContent = personLabel(row) || '—'; } },
      { label: '文件大小', fill: function (td, row) { td.textContent = formatBytes(row.byte_size); } },
      { label: '存储 Key', fill: function (td, row) { td.textContent = cell(row.storage_key); } },
      { label: '上传时间', fill: function (td, row) { td.textContent = formatWhen(row.created_at); } },
      {
        label: '操作',
        fill: function (td, row) {
          if (row.cdn_url) {
            const link = document.createElement('a');
            link.className = 'action-btn';
            link.href = row.cdn_url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = '访问 CDN';
            td.append(link);
          }
          const delBtn = document.createElement('button');
          delBtn.className = 'action-btn danger';
          delBtn.type = 'button';
          delBtn.textContent = '删除';
          delBtn.addEventListener('click', async function () {
            if (!confirm('确定从全平台删除此媒体资产记录吗？')) return;
            delBtn.disabled = true;
            delBtn.textContent = '删除中…';
            try {
              const res = await request('/api/admin/media/' + encodeURIComponent(row.id), { method: 'DELETE' });
              if (res.res.ok && res.data && res.data.success) {
                notify('媒体资源已删除', 'success');
                await loadAdminMedia(currentMediaFilter);
              } else {
                notify(errorMessage(res, '删除失败'), 'error');
                delBtn.disabled = false;
                delBtn.textContent = '删除';
              }
            } catch (_) {
              notify('网络异常，请稍后重试', 'error');
              delBtn.disabled = false;
              delBtn.textContent = '删除';
            }
          });
          td.append(delBtn);
        },
      },
    ], rows);
  }

  let currentMediaFilter = '';
  async function loadAdminMedia(type) {
    currentMediaFilter = type || '';
    const query = currentMediaFilter ? '?assetType=' + encodeURIComponent(currentMediaFilter) : '';
    const result = await request('/api/admin/media' + query);
    renderAdminMedia(result);
  }

  let currentTaskFilter = '';
  async function loadAdminTasks(status) {
    currentTaskFilter = status || '';
    const query = currentTaskFilter ? '?status=' + encodeURIComponent(currentTaskFilter) : '';
    const result = await request('/api/admin/tasks' + query);
    renderAdminTasks(result);
  }

  let currentUserKeyword = '';
  let currentUserFilter = '';
  async function loadUsers(keyword, filter) {
    if (keyword !== undefined) currentUserKeyword = keyword;
    if (filter !== undefined) currentUserFilter = filter;
    const params = [];
    if (currentUserKeyword) params.push('keyword=' + encodeURIComponent(currentUserKeyword));
    if (currentUserFilter) {
      if (currentUserFilter.indexOf('plan:') === 0) {
        params.push('plan=' + encodeURIComponent(currentUserFilter.replace('plan:', '')));
      } else if (currentUserFilter.indexOf('status:') === 0) {
        params.push('status=' + encodeURIComponent(currentUserFilter.replace('status:', '')));
      }
    }
    const query = params.length ? '?' + params.join('&') : '';
    const result = await request('/api/admin/users' + query);
    renderUsers(result);
  }

  let currentOrderFilter = '';
  async function loadAdminOrders(status) {
    currentOrderFilter = status || '';
    const query = currentOrderFilter ? '?status=' + encodeURIComponent(currentOrderFilter) : '';
    const orders = await request('/api/admin/orders' + query);
    renderOrders(document.getElementById('admin-orders-slot'), orders, true);
  }

  function renderAdminPlans(result) {
    const slot = document.getElementById('admin-plans-slot');
    if (!slot) return;
    slot.replaceChildren();
    if (!result.res.ok || !result.data || result.data.success !== true || !Array.isArray(result.data.data)) {
      const note = document.createElement('p');
      note.className = 'empty';
      note.textContent = errorMessage(result, '无法获取套餐方案配置');
      slot.append(note);
      return;
    }
    const rows = result.data.data;
    if (!rows.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = '暂无套餐方案配置。';
      slot.append(empty);
      return;
    }
    renderTable(slot, [
      { label: '方案名称', fill: function (td, row) { td.textContent = row.name; } },
      { label: '标识', fill: function (td, row) { td.textContent = cell(row.slug); } },
      { label: '价格', fill: function (td, row) { td.textContent = row.price_cents > 0 ? '¥' + (row.price_cents / 100) + ' / 月' : '免费体验'; } },
      { label: '包含算力', fill: function (td, row) { td.textContent = formatNumber(row.quota_points) || cell(row.quota_points); } },
      { label: '并发/存储', fill: function (td, row) { td.textContent = row.max_concurrency + ' 任务 · ' + (row.storage_limit_mb >= 1024 ? (row.storage_limit_mb / 1024) + 'GB' : row.storage_limit_mb + 'MB'); } },
      {
        label: '上架状态',
        fill: function (td, row) {
          const dot = document.createElement('i');
          dot.className = row.is_active ? 'dot' : 'dot warn';
          td.append(dot, document.createTextNode(row.is_active ? '已上架' : '已下架'));
        },
      },
      {
        label: '操作',
        fill: function (td, row) {
          const btnToggle = document.createElement('button');
          btnToggle.className = row.is_active ? 'action-btn danger' : 'action-btn primary';
          btnToggle.type = 'button';
          btnToggle.textContent = row.is_active ? '下架' : '上架';
          btnToggle.addEventListener('click', async function () {
            const actionText = row.is_active ? '下架' : '上架';
            if (!confirm('确定要' + actionText + '套餐方案「' + row.name + '」吗？')) return;
            btnToggle.disabled = true;
            btnToggle.textContent = '处理中…';
            try {
              const res = await request('/api/admin/plans/' + encodeURIComponent(row.id) + '/toggle', { method: 'POST' });
              if (res.res.ok && res.data && res.data.success) {
                notify(res.data.message || '操作成功', 'success');
                const refreshed = await request('/api/admin/plans');
                renderAdminPlans(refreshed);
              } else {
                notify(errorMessage(res, '操作失败'), 'error');
                btnToggle.disabled = false;
                btnToggle.textContent = actionText;
              }
            } catch (_) {
              notify('网络异常，请稍后重试', 'error');
              btnToggle.disabled = false;
              btnToggle.textContent = actionText;
            }
          });
          td.append(btnToggle);
        },
      },
    ], rows);
  }

  async function loadAdmin() {
    const [overview, users, tasks, media, orders, plans, health, sysStatus, windows, mac, android] = await Promise.all([
      request('/api/admin/overview'),
      request('/api/admin/users'),
      request('/api/admin/tasks'),
      request('/api/admin/media'),
      request('/api/admin/orders'),
      request('/api/admin/plans'),
      request('/api/health'),
      request('/api/admin/system-status'),
      request('/api/updates/latest?platform=windows&arch=x64'),
      request('/api/updates/latest?platform=macos&arch=arm64'),
      request('/api/updates/latest?platform=android&arch=arm64'),
    ]);
    renderOverview(overview);
    renderUsers(users);
    renderAdminTasks(tasks);
    renderAdminMedia(media);
    renderOrders(document.getElementById('admin-orders-slot'), orders, true);
    renderAdminPlans(plans);
    renderHealth(health, sysStatus);
    renderUpdates([
      { name: 'Windows', ok: windows.res.ok, data: windows.data },
      { name: 'macOS', ok: mac.res.ok, data: mac.data },
      { name: 'Android', ok: android.res.ok, data: android.data },
    ]);
  }

  function viewAllowed(name) {
    if (USER_VIEWS.indexOf(name) >= 0) return true;
    return currentUser && currentUser.role === 'admin' && ADMIN_VIEWS.indexOf(name) >= 0;
  }

  function showView(name) {
    if (!viewAllowed(name)) name = 'overview';
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-panel') !== name;
    });
    document.querySelectorAll('.rail button[data-view]').forEach(function (button) {
      if (button.getAttribute('data-view') === name) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    const button = document.querySelector('.rail button[data-view="' + name + '"]');
    const label = button && button.querySelector('span');
    document.getElementById('console-title').textContent = label ? label.textContent : '概览';
    const kicker = button && adminNav.contains(button) ? (adminNav.getAttribute('data-kicker') || '') : '用户中心';
    document.getElementById('console-kicker').textContent = kicker;
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
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
      showAlert(errorMessage(profile, '无法获取资料'));
      return;
    }
    const user = profile.data.user;
    currentUser = user;
    showLoggedIn();
    adminNav.hidden = user.role !== 'admin';
    renderProfile(user);
    renderMeters(user);
    renderKey(user);
    const plans = await request('/api/plans');
    const orders = await request('/api/auth/orders');
    const ledger = await request('/api/auth/quota/logs');
    const userTasks = await request('/api/tasks/list');
    const userMedia = await request('/api/media/list');
    renderPlan(user, plans);
    renderOrders(document.getElementById('orders-slot'), orders, false);
    renderLedger(ledger);
    renderUserTasks(userTasks);
    renderUserMedia(userMedia);
    if (user.role === 'admin') await loadAdmin();
    const hash = (location.hash || '').replace('#', '');
    showView(viewAllowed(hash) ? hash : 'overview');
  }

  async function submitAuth(path, body, button) {
    if (busy) return;
    busy = true;
    button.disabled = true;
    showAlert('');
    try {
      const result = await request(path, { method: 'POST', body: body });
      if (!result.res.ok || !result.data || !result.data.token) {
        showAlert(errorMessage(result, '账号请求失败'));
        return;
      }
      setToken(result.data.token);
      await loadSession();
    } catch (_) {
      showAlert('网络请求失败，请稍后再试');
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  loginForm.addEventListener('submit', function (event) {
    event.preventDefault();
    const account = document.getElementById('login-account').value.trim();
    const password = document.getElementById('login-password').value;
    if (!account || !password) {
      showAlert('请输入账号与密码');
      return;
    }
    submitAuth('/api/auth/login', { account: account, password: password }, loginForm.querySelector('button'));
  });

  registerForm.addEventListener('submit', function (event) {
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
    submitAuth('/api/auth/register', body, registerForm.querySelector('button.primary'));
  });

  document.getElementById('show-register').addEventListener('click', function () { showGateMode('register'); });
  document.getElementById('show-forgot').addEventListener('click', function () { showGateMode('forgot'); });
  document.getElementById('register-back').addEventListener('click', function () { showGateMode('login'); });
  document.getElementById('forgot-back').addEventListener('click', function () { showGateMode('login'); });

  document.getElementById('btn-refresh').addEventListener('click', function () { loadSession(); });
  document.getElementById('btn-logout').addEventListener('click', function () {
    setToken('');
    showAlert('');
    showLoggedOut();
    showGateMode('login');
  });

  document.querySelectorAll('.rail button[data-view]').forEach(function (button) {
    button.addEventListener('click', function () {
      showView(button.getAttribute('data-view'));
    });
  });

  document.getElementById('user-search').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!currentUser || currentUser.role !== 'admin') return;
    loadUsers(document.getElementById('user-keyword').value.trim());
  });

  const updateProfileForm = document.getElementById('form-update-profile');
  if (updateProfileForm) {
    updateProfileForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const nicknameInput = document.getElementById('profile-nickname-input');
      const nickname = nicknameInput ? nicknameInput.value.trim() : '';
      if (!nickname) {
        showAlert('请输入新的创作者昵称');
        return;
      }
      showAlert('');
      const res = await request('/api/auth/update-profile', {
        method: 'POST',
        body: { nickname: nickname },
      });
      if (res.res.ok && res.data && res.data.success) {
        showAlert('昵称已成功更新为：' + res.data.user.nickname);
        if (currentUser) {
          currentUser.nickname = res.data.user.nickname;
          renderProfile(currentUser);
        }
      } else {
        showAlert(errorMessage(res, '修改昵称失败'));
      }
    });
  }

  const changePasswordForm = document.getElementById('form-change-password');
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const oldPwdInput = document.getElementById('old-pwd-input');
      const newPwdInput = document.getElementById('new-pwd-input');
      const oldPassword = oldPwdInput ? oldPwdInput.value : '';
      const newPassword = newPwdInput ? newPwdInput.value : '';
      if (!oldPassword || !newPassword) {
        showAlert('请输入当前密码和新密码');
        return;
      }
      if (newPassword.length < 6) {
        showAlert('新密码长度至少为 6 位');
        return;
      }
      showAlert('');
      const res = await request('/api/auth/change-password', {
        method: 'POST',
        body: { old_password: oldPassword, new_password: newPassword },
      });
      if (res.res.ok && res.data && res.data.success) {
        showAlert('登录密码修改成功，请妥善保存新密码');
        if (oldPwdInput) oldPwdInput.value = '';
        if (newPwdInput) newPwdInput.value = '';
      } else {
        showAlert(errorMessage(res, '修改密码失败'));
      }
    });
  }

  const taskFilterGroup = document.getElementById('admin-task-filters');
  if (taskFilterGroup) {
    taskFilterGroup.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-filter]');
      if (!btn) return;
      taskFilterGroup.querySelectorAll('button').forEach(function (b) {
        b.className = (b === btn) ? 'action-btn primary' : 'action-btn';
      });
      loadAdminTasks(btn.getAttribute('data-filter'));
    });
  }

  const mediaFilterGroup = document.getElementById('admin-media-filters');
  if (mediaFilterGroup) {
    mediaFilterGroup.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-media-filter]');
      if (!btn) return;
      mediaFilterGroup.querySelectorAll('button').forEach(function (b) {
        b.className = (b === btn) ? 'action-btn primary' : 'action-btn';
      });
      loadAdminMedia(btn.getAttribute('data-media-filter'));
    });
  }

  const userFilterGroup = document.getElementById('admin-user-filters');
  if (userFilterGroup) {
    userFilterGroup.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-user-filter]');
      if (!btn) return;
      userFilterGroup.querySelectorAll('button').forEach(function (b) {
        b.className = (b === btn) ? 'action-btn primary' : 'action-btn';
      });
      loadUsers(undefined, btn.getAttribute('data-user-filter'));
    });
  }

  const orderFilterGroup = document.getElementById('admin-order-filters');
  if (orderFilterGroup) {
    orderFilterGroup.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-order-filter]');
      if (!btn) return;
      orderFilterGroup.querySelectorAll('button').forEach(function (b) {
        b.className = (b === btn) ? 'action-btn primary' : 'action-btn';
      });
      loadAdminOrders(btn.getAttribute('data-order-filter'));
    });
  }

  showGateMode('login');
  if (token()) loadSession();
  else showLoggedOut();
})();

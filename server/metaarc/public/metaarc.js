/**
 * MetaArc (元弧) 商业化运营门户核心交互脚本
 * 品牌域名: MetaArc.COM.CN
 * 职责: 协调登录注册、按接口渲染套餐、展示账号返回的余额。支付渠道未接入，不发起支付。
 */

class MetaArcPortal {
  constructor() {
    this.token = localStorage.getItem('metaarc_token') || null;
    this.user = this.loadLocalUser();
    this.plans = [];
    this.init();
  }

  loadLocalUser() {
    try {
      const saved = localStorage.getItem('metaarc_user');
      return saved ? JSON.parse(saved) : null;
    } catch (_) {
      return null;
    }
  }

  async init() {
    this.bindEvents();
    this.loadPlans();
    if (this.token) {
      await this.fetchUserProfile();
    } else {
      this.renderUserState();
    }
  }

  // 认证状态与请求头工具
  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  // 获取当前登录用户最新资料
  async fetchUserProfile() {
    try {
      const res = await fetch('/api/user/profile', {
        headers: this.getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          this.user = data.user;
          localStorage.setItem('metaarc_user', JSON.stringify(this.user));
          this.renderUserState();
          return;
        }
      }
      if (res.status === 401) {
        this.logout(false);
      }
    } catch (e) {
      console.warn('[Profile fetch failed, using local cache]', e);
    }
    this.renderUserState();
  }

  bindEvents() {
    // 1. 登录/注册弹窗开关
    const btnLogin = document.getElementById('btn-login-open');
    const authClose = document.getElementById('auth-close');
    if (btnLogin) btnLogin.onclick = () => this.openModal('auth-modal');
    if (authClose) authClose.onclick = () => this.closeModal('auth-modal');

    // 2. 提交登录 / 注册
    const btnLoginSubmit = document.getElementById('btn-login-submit');
    if (btnLoginSubmit) btnLoginSubmit.onclick = () => this.handleLogin();

    const btnRegisterSubmit = document.getElementById('btn-register-submit');
    if (btnRegisterSubmit) btnRegisterSubmit.onclick = () => this.handleRegister();

    // 3. 用户中心抽屉与退出登录
    const userBadge = document.getElementById('user-badge-btn');
    const drawerOverlay = document.getElementById('user-drawer-overlay');
    const drawerClose = document.getElementById('drawer-close');
    const btnLogout = document.getElementById('btn-logout');

    if (userBadge) userBadge.onclick = () => this.openDrawer();
    if (drawerClose) drawerClose.onclick = () => this.closeDrawer();
    if (btnLogout) btnLogout.onclick = () => this.logout(true);
    if (drawerOverlay) {
      drawerOverlay.onclick = (e) => {
        if (e.target === drawerOverlay) this.closeDrawer();
      };
    }

    // 4. 超级管理后台开关与 Tab
    const btnAdmin = document.getElementById('btn-admin-open');
    const adminClose = document.getElementById('admin-close');
    if (btnAdmin) btnAdmin.onclick = () => this.openAdmin();
    if (adminClose) adminClose.onclick = () => this.closeModal('admin-modal');

    document.querySelectorAll('.admin-tab').forEach((tab) => {
      tab.onclick = (e) => {
        document.querySelectorAll('.admin-tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.admin-tab-pane').forEach((p) => (p.style.display = 'none'));
        e.currentTarget.classList.add('active');
        const target = e.currentTarget.getAttribute('data-tab');
        const pane = document.getElementById(`admin-pane-${target}`);
        if (pane) pane.style.display = 'block';

        if (target === 'overview') this.loadAdminOverview();
        if (target === 'users') this.loadAdminUsers();
        if (target === 'orders') this.loadAdminOrders();
      };
    });

    // 5. 管理员调额提交
    const btnAdjustQuota = document.getElementById('btn-adjust-quota');
    if (btnAdjustQuota) btnAdjustQuota.onclick = () => this.handleAdminAdjustQuota();

    const btnCopyKey = document.getElementById('btn-copy-api-key');
    if (btnCopyKey) {
      btnCopyKey.onclick = () => {
        const value = document.getElementById('drawer-api-key')?.value || '';
        if (!value) return;
        navigator.clipboard.writeText(value).then(() => {
          alert('已复制。');
        });
      };
    }
  }

  // 弹窗与抽屉控制
  openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
  }

  closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  }

  openDrawer() {
    const el = document.getElementById('user-drawer-overlay');
    if (el) el.classList.add('active');
  }

  closeDrawer() {
    const el = document.getElementById('user-drawer-overlay');
    if (el) el.classList.remove('active');
  }

  // 认证 Tab 切换
  switchAuthTab(tab) {
    const isLogin = tab === 'login';
    const tabLogin = document.getElementById('tab-btn-login');
    const tabRegister = document.getElementById('tab-btn-register');
    const paneLogin = document.getElementById('auth-pane-login');
    const paneRegister = document.getElementById('auth-pane-register');
    const modalTitle = document.getElementById('auth-modal-title');

    if (tabLogin) tabLogin.className = `auth-tab ${isLogin ? 'active' : ''}`;
    if (tabRegister) tabRegister.className = `auth-tab ${!isLogin ? 'active' : ''}`;
    if (paneLogin) paneLogin.style.display = isLogin ? 'block' : 'none';
    if (paneRegister) paneRegister.style.display = !isLogin ? 'block' : 'none';
    if (modalTitle) modalTitle.textContent = isLogin ? '登录 MetaArc' : '注册 MetaArc 账号';

    this.showAuthError('login', '');
    this.showAuthError('register', '');
  }

  showAuthError(type, msg) {
    const banner = document.getElementById(`${type}-error-banner`);
    if (banner) {
      if (msg) {
        banner.textContent = msg;
        banner.style.display = 'block';
      } else {
        banner.textContent = '';
        banner.style.display = 'none';
      }
    }
  }

  // 登录处理
  async handleLogin() {
    const accountInput = document.getElementById('login-account-input');
    const passwordInput = document.getElementById('login-password-input');
    const btn = document.getElementById('btn-login-submit');

    const account = accountInput?.value?.trim();
    const password = passwordInput?.value;

    if (!account || !password) {
      this.showAuthError('login', '请输入账号（手机号或邮箱）与密码');
      return;
    }

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = '登录中...';
      }
      this.showAuthError('login', '');

      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        this.showAuthError('login', data.message || '账号或密码错误');
        return;
      }

      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('metaarc_token', this.token);
      localStorage.setItem('metaarc_user', JSON.stringify(this.user));

      this.closeModal('auth-modal');
      this.renderUserState();

      if (this.user.role === 'admin') {
        alert(`🎉 登录成功！超级管理员：${this.user.nickname || this.user.email}\n顶栏已解锁【⚙ 管理后台】。`);
      } else {
        alert(`🎉 登录成功！欢迎回来，${this.user.nickname || this.user.email}！`);
      }
    } catch (err) {
      this.showAuthError('login', '网络连接异常，请稍后重试');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '立即登录';
      }
    }
  }

  // 注册处理
  async handleRegister() {
    const nicknameInput = document.getElementById('register-nickname-input');
    const accountInput = document.getElementById('register-account-input');
    const passwordInput = document.getElementById('register-password-input');
    const confirmInput = document.getElementById('register-confirm-input');
    const btn = document.getElementById('btn-register-submit');

    const nickname = nicknameInput?.value?.trim() || '创作者';
    const account = accountInput?.value?.trim();
    const password = passwordInput?.value;
    const confirm = confirmInput?.value;

    if (!account) {
      this.showAuthError('register', '请输入登录邮箱或手机号');
      return;
    }
    if (!password || password.length < 6) {
      this.showAuthError('register', '密码长度至少需为 6 位');
      return;
    }
    if (password !== confirm) {
      this.showAuthError('register', '两次输入的密码不一致');
      return;
    }

    const payload = {
      nickname,
      password,
      email: account.includes('@') ? account : undefined,
      phone: !account.includes('@') ? account : undefined,
    };

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = '注册中...';
      }
      this.showAuthError('register', '');

      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        this.showAuthError('register', data.message || '注册失败');
        return;
      }

      this.token = data.token;
      this.user = data.user;
      localStorage.setItem('metaarc_token', this.token);
      localStorage.setItem('metaarc_user', JSON.stringify(this.user));

      this.closeModal('auth-modal');
      this.renderUserState();

      alert(this.registerSuccessMessage(data.user));
    } catch (err) {
      this.showAuthError('register', '网络连接异常，请稍后重试');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '注册';
      }
    }
  }

  // 退出登录
  logout(showAlert = true) {
    this.token = null;
    this.user = null;
    localStorage.removeItem('metaarc_token');
    localStorage.removeItem('metaarc_user');
    this.renderUserState();
    this.closeDrawer();
    this.closeModal('admin-modal');
    if (showAlert) {
      alert('已成功退出当前账号。');
    }
  }

  // 渲染用户状态与顶栏/抽屉
  renderUserState() {
    const unauthGroup = document.getElementById('unauth-group');
    const authGroup = document.getElementById('auth-group');
    const adminPill = document.getElementById('btn-admin-open');

    if (!this.user || !this.token) {
      if (unauthGroup) unauthGroup.style.display = 'flex';
      if (authGroup) authGroup.style.display = 'none';
      if (adminPill) adminPill.style.display = 'none';
      return;
    }

    if (unauthGroup) unauthGroup.style.display = 'none';
    if (authGroup) authGroup.style.display = 'flex';

    const isAdmin = this.user.role === 'admin';
    if (adminPill) adminPill.style.display = isAdmin ? 'inline-flex' : 'none';

    // 顶栏配额显示
    const chip = document.getElementById('nav-user-quota');
    if (chip) {
      const q = this.readNumber(this.user.quota);
      chip.textContent = q === null ? '—' : `${q.toLocaleString('zh-CN')} 点`;
    }

    // 抽屉详情
    const drawerNick = document.getElementById('drawer-nickname');
    const drawerAccount = document.getElementById('drawer-account-text');
    const drawerPlan = document.getElementById('drawer-plan-badge');
    const drawerQuota = document.getElementById('drawer-quota-val');
    const drawerTotal = document.getElementById('drawer-total-val');
    const drawerBar = document.getElementById('drawer-quota-bar');
    const drawerKey = document.getElementById('drawer-api-key');

    const matchedPlan = this.plans.find((plan) => plan.slug === this.user.plan);

    if (drawerNick) drawerNick.textContent = this.user.nickname || '创作者';
    if (drawerAccount) drawerAccount.textContent = this.user.email || this.user.phone || '';
    if (drawerPlan) drawerPlan.textContent = matchedPlan?.name || this.user.plan || '—';

    const quota = this.readNumber(this.user.quota);
    const total = this.readNumber(this.user.total_quota);
    if (drawerQuota) {
      drawerQuota.textContent = quota === null ? '—' : quota.toLocaleString('zh-CN');
    }
    if (drawerTotal) {
      drawerTotal.textContent = total === null ? '' : `/ ${total.toLocaleString('zh-CN')}`;
    }
    if (drawerBar) {
      const pct = quota !== null && total !== null && total > 0
        ? Math.min(100, Math.max(0, (quota / total) * 100))
        : 0;
      drawerBar.style.width = `${pct}%`;
    }
    this.renderApiKey(drawerKey);
  }

  registerSuccessMessage(user) {
    const quota = this.readNumber(user?.quota);
    const parts = ['注册成功。'];
    if (quota !== null) {
      parts.push(`当前余额 ${quota.toLocaleString('zh-CN')} 点。`);
    }
    if (this.isProvisionedKey(user?.new_api_key)) {
      parts.push('算力通道已返回凭据。');
    } else {
      parts.push('算力通道尚未开通。');
    }
    return parts.join('');
  }

  isProvisionedKey(key) {
    const value = String(key || '').trim();
    return value.length > 0 && !value.startsWith('sk-mock-');
  }

  renderApiKey(drawerKey) {
    const status = document.getElementById('drawer-key-status');
    const row = document.getElementById('drawer-key-row');
    const key = this.user?.new_api_key || '';
    const provisioned = this.isProvisionedKey(key);
    if (drawerKey) drawerKey.value = provisioned ? key : '';
    if (status) {
      status.style.display = provisioned ? 'none' : 'block';
      status.textContent = provisioned ? '' : '算力通道尚未开通';
    }
    if (row) row.style.display = provisioned ? 'flex' : 'none';
  }

  // ==============================================================================
  // 超级管理员控制台模块 (Admin Console)
  // ==============================================================================
  openAdmin() {
    if (!this.user || this.user.role !== 'admin') {
      alert('需要超级管理员权限。请先使用管理员账号登录。');
      this.openModal('auth-modal');
      return;
    }
    this.openModal('admin-modal');
    this.loadAdminOverview();
    this.loadAdminUsers();
  }

  async loadAdminOverview() {
    try {
      const res = await fetch('/api/admin/overview', {
        headers: this.getHeaders(),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (!json.success || !json.data) return;

      const d = json.data;
      const elTotalUsers = document.getElementById('admin-stat-total-users');
      const elTodayUsers = document.getElementById('admin-stat-today-users');
      const elTodayRevenue = document.getElementById('admin-stat-today-revenue');
      const elTotalRevenue = document.getElementById('admin-stat-total-revenue');
      const elActiveTasks = document.getElementById('admin-stat-active-tasks');

      if (elTotalUsers) elTotalUsers.textContent = (d.total_users || 0).toLocaleString();
      if (elTodayUsers) elTodayUsers.textContent = `+${d.today_new_users || 0} 今日`;
      if (elTodayRevenue) elTodayRevenue.textContent = `¥ ${d.today_revenue_yuan || '0.00'}`;
      if (elTotalRevenue) elTotalRevenue.textContent = `¥ ${d.total_revenue_yuan || '0.00'}`;
      if (elActiveTasks) elActiveTasks.textContent = (d.active_tasks || 0).toLocaleString();
    } catch (e) {
      console.error('[Load Admin Overview Error]', e);
    }
  }

  async loadAdminUsers() {
    const tbody = document.getElementById('admin-users-table-body');
    if (!tbody) return;

    try {
      const res = await fetch('/api/admin/users?limit=50', {
        headers: this.getHeaders(),
      });
      if (!res.ok) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#f87171; padding:24px;">加载失败: 需要管理员权限或登录失效</td></tr>`;
        return;
      }
      const json = await res.json();
      const users = json.data || [];

      if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--ink-mute); padding:24px;">暂无用户数据</td></tr>`;
        return;
      }

      tbody.innerHTML = users.map((u) => {
        const keyShort = u.new_api_key ? `${u.new_api_key.substring(0, 10)}...` : '-';
        const roleBadge = u.role === 'admin'
          ? `<span style="color:#C4B5FD; background:rgba(157,123,252,0.15); padding:2px 6px; border-radius:4px; font-size:11px;">超管</span>`
          : `<span style="color:var(--ink-mute); font-size:11px;">普通</span>`;
        const timeStr = u.created_at ? new Date(u.created_at).toLocaleString('zh-CN', { hour12: false }) : '-';

        return `
          <tr>
            <td class="mono" title="${u.id}" style="cursor:pointer;" onclick="metaarc.selectUserForAdjust('${u.id}')">${u.id.substring(0, 8)}...</td>
            <td>${u.email || u.phone || '-'}</td>
            <td>${u.nickname || '-'}</td>
            <td>${roleBadge}</td>
            <td><span style="color:var(--ma-brand-gold);">${u.plan || 'free'}</span></td>
            <td class="mono" style="color:var(--ink-mute); font-size:11px;">${keyShort}</td>
            <td class="mono" style="color:var(--ma-brand-cyan);">${Number(u.quota).toLocaleString()} / ${Number(u.total_quota).toLocaleString()}</td>
            <td class="mono" style="color:var(--ink-mute); font-size:12px;">${timeStr}</td>
            <td>
              <button class="btn-auth-primary" style="height:26px; font-size:11px; padding:0 10px;" onclick="metaarc.selectUserForAdjust('${u.id}')">调额</button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      console.error('[Load Admin Users Error]', e);
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:#f87171; padding:24px;">网络异常，无法加载用户列表</td></tr>`;
    }
  }

  selectUserForAdjust(userId) {
    const input = document.getElementById('admin-adjust-user-id');
    if (input) {
      input.value = userId;
      input.focus();
    }
    // 切换到用户 Tab
    const tabUsers = document.querySelector('[data-tab="users"]');
    if (tabUsers) tabUsers.click();
  }

  async handleAdminAdjustQuota() {
    const inputUser = document.getElementById('admin-adjust-user-id');
    const inputAmount = document.getElementById('admin-adjust-amount');
    const inputReason = document.getElementById('admin-adjust-reason');
    const btn = document.getElementById('btn-adjust-quota');

    const targetUserId = inputUser?.value?.trim();
    const amount = parseFloat(inputAmount?.value || '0');
    const reason = inputReason?.value?.trim() || '管理员调额';

    if (!targetUserId) {
      alert('请先输入或从表格中选择目标用户的 UUID');
      return;
    }
    if (isNaN(amount) || amount === 0) {
      alert('请输入有效的点数数值（正数加点，负数扣点）');
      return;
    }

    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = '提交中...';
      }
      const res = await fetch(`/api/admin/users/${targetUserId}/adjust-quota`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ amount, reason }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        alert(`❌ 调额失败: ${data.message || '未知错误'}`);
        return;
      }

      alert(`✅ 调额成功！用户最新余额: ${Number(data.user.quota).toLocaleString()} 点数`);
      this.loadAdminUsers();
      this.loadAdminOverview();
      if (this.user && this.user.id === targetUserId) {
        this.fetchUserProfile();
      }
    } catch (err) {
      alert('网络异常，调额操作未完成');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '确认调额';
      }
    }
  }

  async loadAdminOrders() {
    const tbody = document.getElementById('admin-orders-table-body');
    if (!tbody) return;

    try {
      const res = await fetch('/api/admin/orders', {
        headers: this.getHeaders(),
      });
      if (!res.ok) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#f87171; padding:24px;">加载失败</td></tr>`;
        return;
      }
      const json = await res.json();
      const orders = json.data || [];

      if (orders.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--ink-mute); padding:24px;">暂无订单记录</td></tr>`;
        return;
      }

      tbody.innerHTML = orders.map((o) => {
        const timeStr = o.created_at ? new Date(o.created_at).toLocaleString('zh-CN', { hour12: false }) : '-';
        const amountYuan = (Number(o.amount_cents || 0) / 100).toFixed(2);
        const statusColor = o.status === 'paid' ? 'var(--ma-success)' : 'var(--ink-mute)';
        const statusText = o.status === 'paid' ? '已支付' : '待支付';

        return `
          <tr>
            <td class="mono">${o.id ? o.id.substring(0, 12) : '-'}...</td>
            <td>${o.email || o.phone || o.user_id?.substring(0, 8)}</td>
            <td>${o.plan_name || o.plan_id || '算力包'}</td>
            <td class="mono" style="color:var(--ma-brand-gold);">¥ ${amountYuan}</td>
            <td>${o.pay_channel === 'alipay' ? '支付宝' : '微信支付'}</td>
            <td class="mono" style="color:var(--ink-mute);">${timeStr}</td>
            <td><span style="color:${statusColor}; font-weight:600;">${statusText}</span></td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      console.error('[Load Admin Orders Error]', e);
    }
  }

  async loadPlans() {
    const grid = document.getElementById('pricing-grid');
    const status = document.getElementById('pricing-status');
    try {
      const res = await fetch('/api/plans');
      const data = await res.json();
      const plans = Array.isArray(data?.data) ? data.data : null;
      if (!res.ok || !data?.success || !plans) {
        this.renderPlansUnavailable(grid, status, '套餐暂时无法获取，此处不展示价格。');
        return;
      }
      if (plans.length === 0) {
        this.renderPlansUnavailable(grid, status, '当前没有可展示的套餐。');
        return;
      }
      this.plans = plans;
      this.renderPlans(grid, status, plans);
      if (this.user) this.renderUserState();
    } catch (e) {
      console.warn('[Plans fetch failed]', e);
      this.renderPlansUnavailable(grid, status, '套餐暂时无法获取，此处不展示价格。');
    }
  }

  renderPlansUnavailable(grid, status, message) {
    if (grid) {
      grid.hidden = true;
      grid.innerHTML = '';
    }
    if (status) {
      status.hidden = false;
      status.textContent = message;
    }
  }

  renderPlans(grid, status, plans) {
    if (status) status.hidden = true;
    if (!grid) return;
    const cards = plans.map((plan) => this.renderPlanCard(plan)).filter(Boolean);
    if (cards.length === 0) {
      this.renderPlansUnavailable(grid, status, '套餐暂时无法获取，此处不展示价格。');
      return;
    }
    grid.hidden = false;
    grid.innerHTML = cards.join('');
  }

  renderPlanCard(plan) {
    const name = typeof plan?.name === 'string' ? plan.name.trim() : '';
    if (!name) return '';
    const slug = typeof plan.slug === 'string' ? plan.slug : '';
    const price = this.formatPlanPrice(plan.price_cents);
    const points = this.formatPlanPoints(plan.quota_points);
    const period = this.formatBillingCycle(plan.billing_cycle);
    const features = this.planFeatures(plan.features);
    const featureHtml = features.length
      ? `<ul class="plan-features">${features.map((item) => `<li>${this.checkIcon()}${this.escapeHtml(item)}</li>`).join('')}</ul>`
      : '';
    const priceHtml = price
      ? `<div class="plan-price"><span class="plan-amount">${this.escapeHtml(price)}</span>${period ? `<span class="plan-period">${this.escapeHtml(period)}</span>` : ''}</div>`
      : '';
    const pointsHtml = points
      ? `<p class="plan-desc">${this.escapeHtml(points)} 点</p>`
      : '';
    return `
      <div class="plan-card" data-plan-slug="${this.escapeHtml(slug)}">
        <div class="plan-name">${this.escapeHtml(name)}</div>
        ${priceHtml}
        ${pointsHtml}
        ${featureHtml}
        <button class="btn-plan" type="button" disabled>支付尚未开通</button>
      </div>
    `;
  }

  readNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
  }

  formatPlanPrice(cents) {
    const amount = this.readNumber(cents);
    if (amount === null) return '';
    const yuan = amount / 100;
    const text = Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
    return `¥${text}`;
  }

  formatPlanPoints(points) {
    const amount = this.readNumber(points);
    if (amount === null) return '';
    return amount.toLocaleString('zh-CN');
  }

  formatBillingCycle(cycle) {
    if (cycle === 'monthly') return '/ 月';
    if (cycle === 'yearly') return '/ 年';
    if (typeof cycle === 'string' && cycle.trim()) return `/ ${cycle.trim()}`;
    return '';
  }

  planFeatures(features) {
    let list = features;
    if (typeof list === 'string') {
      try {
        list = JSON.parse(list);
      } catch (_) {
        return [];
      }
    }
    if (!Array.isArray(list)) return [];
    return list.filter((item) => typeof item === 'string' && item.trim());
  }

  checkIcon() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
  }

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// 挂载全局单例
window.metaarc = new MetaArcPortal();

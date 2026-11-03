/**
 * MetaArc (元弧) 门户交互脚本
 * 品牌域名: MetaArc.COM.CN
 * 职责: 按 /api/plans 渲染套餐，并在 Windows 清单给出本域安装包时替换下载卡片。
 * 不请求账号或后台接口，也不发起支付。没有清单时下载区保持尚未发布。
 */

class MetaArcPortal {
  constructor() {
    this.plans = [];
    this.loadPlans();
    this.loadWindowsDownload();
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

  async loadWindowsDownload() {
    const card = document.getElementById('download-windows');
    if (!card) return;
    try {
      const res = await fetch('/api/updates/latest?platform=windows&arch=x64');
      if (!res.ok) return;
      const data = await res.json();
      const url = this.windowsDownloadUrl(data);
      if (!url) return;
      const link = document.createElement('a');
      link.className = 'dl';
      link.dataset.os = 'win';
      link.href = url;
      link.rel = 'noopener';
      const unsigned = data.signed !== true;
      const meta = unsigned ? '64 位 · 未签名' : '64 位';
      const action = unsigned ? '下载内测包' : '下载';
      link.innerHTML = `<span class="dl-os">Windows</span><span class="dl-meta mono">${meta}</span><span class="dl-go">${action}</span>`;
      card.replaceWith(link);
      const lead = document.getElementById('download-lead');
      if (lead) {
        lead.textContent = data.channel === 'stable'
          ? 'Windows 安装包可以下载。macOS 与 Android 尚未发布。'
          : 'Windows 内测包可以下载。macOS 与 Android 尚未发布。';
      }
    } catch (e) {
      console.warn('[Windows download manifest failed]', e);
    }
  }

  windowsDownloadUrl(data) {
    if (!data || data.has_update !== true) return '';
    const raw = typeof data.download_url === 'string' ? data.download_url.trim() : '';
    return this.isWindowsSetupUrl(raw) ? raw : '';
  }

  isWindowsSetupUrl(raw) {
    let url;
    try {
      url = new URL(raw);
    } catch (_) {
      return false;
    }
    if (url.username || url.password || url.hash) return false;
    let pathname = url.pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch (_) {
      return false;
    }
    const path = pathname.toLowerCase();
    if (!path.endsWith('.exe') || !path.includes('setup') || path.includes('..')) return false;
    const host = url.hostname.toLowerCase();
    if (host === 'github.com' || host.endsWith('.github.com') || host.endsWith('.githubusercontent.com') || host.includes('looplj')) {
      return false;
    }
    const metaArcHost = host === 'metaarc.com.cn' || host.endsWith('.metaarc.com.cn');
    if (url.protocol === 'https:' && metaArcHost) return true;
    return url.origin === window.location.origin && (url.protocol === 'https:' || url.protocol === 'http:');
  }
}

window.metaarc = new MetaArcPortal();

/**
 * MetaArc 元弧门户脚本。
 * 套餐只渲染 GET /api/plans。下载只在更新清单给出允许的安装包地址时变成链接。
 * 不请求账号接口，也不发起支付。
 */
class MetaArcPortal {
  constructor() {
    this.loadPlans();
    this.loadDownloads();
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
      this.renderPlans(grid, status, plans);
    } catch (e) {
      console.warn('[Plans fetch failed]', e);
      this.renderPlansUnavailable(grid, status, '套餐暂时无法获取，此处不展示价格。');
    }
  }

  renderPlansUnavailable(grid, status, message) {
    if (grid) {
      grid.hidden = true;
      grid.replaceChildren();
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
      ? `<ul class="plan-features">${features.map((item) => `<li><span>${this.escapeHtml(item)}</span></li>`).join('')}</ul>`
      : '';
    const priceHtml = price
      ? `<p class="plan-price"><span class="plan-amount">${this.escapeHtml(price)}</span>${period ? `<span class="plan-period">${this.escapeHtml(period)}</span>` : ''}</p>`
      : '';
    const pointsHtml = points ? `<p class="plan-points">${this.escapeHtml(points)} 点</p>` : '';
    return `
      <article class="plan-card" data-plan-slug="${this.escapeHtml(slug)}">
        <h3 class="plan-name">${this.escapeHtml(name)}</h3>
        ${priceHtml}
        ${pointsHtml}
        ${featureHtml}
        <p class="plan-closed">支付尚未开通</p>
      </article>
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
      try { list = JSON.parse(list); } catch (_) { return []; }
    }
    if (!Array.isArray(list)) return [];
    return list.filter((item) => typeof item === 'string' && item.trim());
  }

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async loadDownloads() {
    const windowsCard = document.getElementById('download-windows');
    try {
      const windowsRes = await fetch('/api/updates/latest?platform=windows&arch=x64');
      const catalogRes = await fetch('/api/updates/catalog');
      const windows = windowsRes.ok ? await windowsRes.json() : null;
      const catalog = catalogRes.ok ? await catalogRes.json() : null;
      const platforms = Array.isArray(catalog?.platforms) ? catalog.platforms : [];
      const byName = {};
      platforms.forEach((item) => {
        if (item && typeof item.platform === 'string') byName[item.platform] = item;
      });
      if (windows) byName.windows = { ...byName.windows, ...windows, platform: 'windows' };
      this.applyDownload('download-windows', byName.windows, 'windows');
      this.applyDownload('download-macos', byName.macos, 'macos');
      this.applyDownload('download-android', byName.android, 'android');
      this.renderDownloadLead(byName.windows);
      if (!windowsCard) return;
    } catch (e) {
      console.warn('[Download manifest failed]', e);
    }
  }

  renderDownloadLead(windows) {
    const lead = document.getElementById('download-lead');
    const notes = document.getElementById('download-notes');
    const primary = document.getElementById('primary-dl');
    const available = windows && windows.has_update === true && this.packageUrl(windows, 'windows');
    if (lead) {
      if (!available) {
        lead.textContent = '更新清单没有可下载的安装包。Windows、macOS 与 Android 保持尚未发布。';
      } else {
        const version = windows.version ? ` ${windows.version}` : '';
        const signed = windows.signed === true ? '已签名' : '未签名内测';
        lead.textContent = `Windows${version} ${signed}。macOS 与 Android 以各自清单为准，没有安装包时保持尚未发布。`;
      }
    }
    if (primary) {
      primary.textContent = available ? '查看 Windows 下载说明' : '查看下载状态';
      primary.href = '#download';
    }
    if (notes) {
      notes.replaceChildren();
      if (available && windows.release_notes) {
        const block = document.createElement('div');
        block.className = 'note-block';
        const title = document.createElement('strong');
        title.textContent = '这份 Windows 包的说明';
        const body = document.createElement('p');
        body.textContent = String(windows.release_notes);
        block.append(title, body);
        notes.append(block);
      }
    }
  }

  applyDownload(id, data, platform) {
    const card = document.getElementById(id);
    if (!card || !data) return;
    const url = data.has_update === true ? this.packageUrl(data, platform) : '';
    const meta = this.releaseMeta(data, platform);
    const go = url ? (data.signed === true ? '下载' : '下载内测包') : '尚未发布';
    if (!url) {
      const metaNode = card.querySelector('.dl-meta');
      const goNode = card.querySelector('.dl-go');
      if (metaNode) metaNode.textContent = meta;
      if (goNode) goNode.textContent = go;
      return;
    }
    const link = document.createElement('a');
    link.className = 'dl';
    link.href = url;
    link.rel = 'noopener';
    link.replaceChildren(
      this.span('dl-os', card.querySelector('.dl-os')?.textContent || platform),
      this.span('dl-meta', meta),
      this.span('dl-go', go),
    );
    card.replaceWith(link);
  }

  span(className, text) {
    const node = document.createElement('span');
    node.className = className;
    node.textContent = text;
    return node;
  }

  releaseMeta(data, platform) {
    const parts = [];
    if (platform === 'windows') parts.push('64 位');
    if (platform === 'macos') parts.push('Apple 芯片');
    if (platform === 'android') parts.push('arm64');
    if (data.version) parts.push(String(data.version));
    if (data.has_update === true) parts.push(data.signed === true ? '已签名' : '未签名');
    if (data.channel) parts.push(String(data.channel));
    return parts.join(' · ');
  }

  packageUrl(data, platform) {
    const raw = typeof data?.download_url === 'string' ? data.download_url.trim() : '';
    if (!raw || !this.isAllowedPackageUrl(raw, platform)) return '';
    return raw;
  }

  isAllowedPackageUrl(raw, platform) {
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
}

window.metaarc = new MetaArcPortal();

/**
 * FirstPen Admin Console (SPA)
 * バニラJS + Chart.js
 */

// ============================================================
//  設定 (localStorageでも上書き可能)
// ============================================================
const DEFAULT_API_BASE = 'https://firstpen-waitlist-api.soga-naoya.workers.dev';

const App = {
  apiBase: localStorage.getItem('fp_admin_api') || DEFAULT_API_BASE,
  view: document.getElementById('view'),
  breadcrumb: document.getElementById('breadcrumb'),
  modal: document.getElementById('modal'),
  modalTitle: document.getElementById('modal-title'),
  modalBody: document.getElementById('modal-body'),
  toast: document.getElementById('toast'),

  // 状態
  cache: { tags: [], templates: [] },

  // ============================================================
  //  認証管理
  // ============================================================
  AUTH_KEY: 'fp_admin_auth',
  getAuth() { return localStorage.getItem(this.AUTH_KEY) || ''; },
  setAuth(user, pass) { localStorage.setItem(this.AUTH_KEY, btoa(`${user}:${pass}`)); },
  clearAuth() { localStorage.removeItem(this.AUTH_KEY); },

  showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
  },

  hideLoginScreen() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
  },

  async doLogin() {
    const user = document.getElementById('l-user').value.trim();
    const pass = document.getElementById('l-pass').value;
    const err = document.getElementById('l-err');
    err.classList.add('hidden');
    if (!user || !pass) { err.textContent = 'ユーザー名とパスワードを入力してください'; err.classList.remove('hidden'); return; }
    this.setAuth(user, pass);
    try {
      await this.api('/api/admin/stats/overview');
      this.hideLoginScreen();
      this.bindNav();
      this.bindGlobal();
      await this.healthCheck();
      this.handleRoute();
      window.addEventListener('hashchange', () => this.handleRoute());
    } catch (e) {
      this.clearAuth();
      err.textContent = 'ユーザー名またはパスワードが違います';
      err.classList.remove('hidden');
    }
  },

  logout() {
    this.clearAuth();
    this.showLoginScreen();
  },

  // ============================================================
  //  起動
  // ============================================================
  async start() {
    if (!this.getAuth()) {
      this.showLoginScreen();
      document.getElementById('l-pass').addEventListener('keydown', e => { if (e.key === 'Enter') this.doLogin(); });
      return;
    }
    this.hideLoginScreen();
    this.bindNav();
    this.bindGlobal();
    await this.healthCheck();
    this.handleRoute();
    window.addEventListener('hashchange', () => this.handleRoute());
  },

  bindNav() {
    document.querySelectorAll('.nav-link').forEach(a => {
      a.addEventListener('click', e => {
        // hashchangeで自動処理
      });
    });
  },
  bindGlobal() {
    document.getElementById('reload-btn').addEventListener('click', () => this.handleRoute(true));
  },

  // ============================================================
  //  API helpers
  // ============================================================
  async api(path, opts = {}) {
    const auth = this.getAuth();
    const res = await fetch(`${this.apiBase}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { 'Authorization': `Basic ${auth}` } : {}),
        ...(opts.headers || {}),
      },
    });
    if (res.status === 401) {
      this.clearAuth();
      this.showLoginScreen();
      throw new Error('認証が必要です。再ログインしてください。');
    }
    if (!res.ok) {
      let msg = `${res.status}`;
      try { msg = (await res.json()).error || msg; } catch {}
      throw new Error(msg);
    }
    return res.json();
  },

  async healthCheck() {
    const el = document.querySelector('#api-status span');
    const wrap = document.getElementById('api-status');
    try {
      const r = await fetch(`${this.apiBase}/api/health`);
      const j = await r.json();
      el.textContent = j.ok ? '接続OK' : '異常';
      wrap.classList.add(j.ok ? 'ok' : 'ng');
    } catch (e) {
      el.textContent = '接続不可';
      wrap.classList.add('ng');
    }
  },

  // ============================================================
  //  ルーティング
  // ============================================================
  routes: {
    'dashboard':   { title: 'ダッシュボード',     fn: 'renderDashboard' },
    'subscribers': { title: '登録者一覧',         fn: 'renderSubscribers' },
    'tags':        { title: 'タグ・セグメント',   fn: 'renderTags' },
    'templates':   { title: 'テンプレート',       fn: 'renderTemplates' },
    'campaigns':   { title: '手動メール送信',     fn: 'renderCampaigns' },
    'step-flows':  { title: 'ステップメール',     fn: 'renderStepFlows' },
    'settings':    { title: '設定',               fn: 'renderSettings' },
  },

  async handleRoute(force = false) {
    const hash = location.hash.replace('#/', '') || 'dashboard';
    const route = this.routes[hash] || this.routes.dashboard;
    document.querySelectorAll('.nav-link').forEach(a => {
      a.classList.toggle('active', a.dataset.route === hash);
    });
    this.breadcrumb.textContent = route.title;
    this.view.innerHTML = '<div class="loading">読み込み中...</div>';
    try {
      await this[route.fn]();
    } catch (e) {
      this.view.innerHTML = `<div class="card"><h2 class="section-title">エラー</h2><p class="muted">${this.escape(e.message)}</p></div>`;
    }
  },

  // ============================================================
  //  UI helpers
  // ============================================================
  escape(s) { return String(s == null ? '' : s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); },
  fmtDate(iso) { if (!iso) return '-'; return iso.replace('T',' ').slice(0,16); },
  fmtNum(n) { return (n || 0).toLocaleString(); },
  fmtPct(n) { return ((n || 0) * 100).toFixed(1) + '%'; },

  showToast(msg, type = 'ok') {
    this.toast.textContent = msg;
    this.toast.className = `toast ${type} show`;
    clearTimeout(this._tt);
    this._tt = setTimeout(() => this.toast.classList.remove('show'), 2400);
  },

  openModal(title, html) {
    this.modalTitle.textContent = title;
    this.modalBody.innerHTML = html;
    this.modal.classList.remove('hidden');
  },
  closeModal() { this.modal.classList.add('hidden'); this.modalBody.innerHTML = ''; },

  badge(status) {
    const map = { active: '配信中', unsubscribed: '配信停止', bounced: 'バウンス' };
    return `<span class="badge badge-${status === 'unsubscribed' ? 'unsub' : status}">${map[status] || status}</span>`;
  },

  tagChips(tags) {
    if (!tags || !tags.length) return '<span class="dim">-</span>';
    return tags.map(t => `<span class="tag-chip" style="background:${this.hexAlpha(t.color, .15)};color:${t.color};border-color:${this.hexAlpha(t.color, .35)};">${this.escape(t.name)}</span>`).join('');
  },
  hexAlpha(hex, a) {
    const m = (hex || '#a78bfa').replace('#','');
    const r = parseInt(m.slice(0,2),16), g = parseInt(m.slice(2,4),16), b = parseInt(m.slice(4,6),16);
    return `rgba(${r},${g},${b},${a})`;
  },

  // ============================================================
  //  画面: ダッシュボード
  // ============================================================
  async renderDashboard() {
    const data = await this.api('/api/admin/stats/overview');
    const s = data.subscribers;
    const e = data.email_stats_30d;

    this.view.innerHTML = `
      <div class="grid grid-4">
        <div class="card">
          <div class="card-title">総登録者</div>
          <div class="card-value">${this.fmtNum(s.total)}</div>
          <div class="card-sub">配信可能: ${this.fmtNum(s.active)}</div>
        </div>
        <div class="card">
          <div class="card-title">本日の登録</div>
          <div class="card-value" style="color:#34d399">+${this.fmtNum(s.today)}</div>
          <div class="card-sub">過去7日: +${this.fmtNum(s.last7d)}</div>
        </div>
        <div class="card">
          <div class="card-title">開封率 (30日)</div>
          <div class="card-value">${this.fmtPct(e.open_rate)}</div>
          <div class="card-sub">${this.fmtNum(e.open)} 件 / ${this.fmtNum(e.delivered)} 配信</div>
        </div>
        <div class="card">
          <div class="card-title">クリック率 (30日)</div>
          <div class="card-value">${this.fmtPct(e.click_rate)}</div>
          <div class="card-sub">バウンス率: ${this.fmtPct(e.bounce_rate)}</div>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-title">日別登録推移 (直近30日)</div>
          <div class="chart-wrap"><canvas id="ch-signup"></canvas></div>
        </div>
        <div class="card">
          <div class="card-title">属性別構成</div>
          <div class="chart-wrap"><canvas id="ch-role"></canvas></div>
        </div>
      </div>
    `;

    // Chart 1: 日別登録
    const signups = (data.daily_signups_30d || []);
    const labels = signups.map(r => r.d.slice(5));
    new Chart(document.getElementById('ch-signup'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '登録数', data: signups.map(r => r.n),
          borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,.15)',
          fill: true, tension: .3, pointRadius: 2,
        }],
      },
      options: chartOpts(),
    });

    // Chart 2: role
    const roleMap = { seller: '出品', buyer: '購入', both: '両方', '': '未選択' };
    const roleData = (data.by_role || []);
    new Chart(document.getElementById('ch-role'), {
      type: 'doughnut',
      data: {
        labels: roleData.map(r => roleMap[r.role] || r.role || '?'),
        datasets: [{
          data: roleData.map(r => r.n),
          backgroundColor: ['#7c3aed','#10b981','#fbbf24','#6b7280'],
          borderColor: '#1a1a1a', borderWidth: 2,
        }],
      },
      options: { plugins: { legend: { labels: { color: '#bbb', font: { size: 12 } } } }, cutout: '65%' },
    });
  },

  // ============================================================
  //  画面: 登録者一覧
  // ============================================================
  async renderSubscribers() {
    await this.loadTagsCache();

    this.view.innerHTML = `
      <div class="row" style="justify-content:space-between;margin-bottom:14px">
        <h2 class="section-title" style="margin:0">登録者一覧</h2>
        <div class="row">
          <button class="btn" onclick="App.exportCsv()">📥 CSV出力</button>
          <button class="btn btn-primary" onclick="App.openNewSubscriber()">+ 新規追加</button>
        </div>
      </div>

      <div class="table-wrap">
        <div class="table-toolbar">
          <input class="input search" id="f-q" placeholder="🔍 メール・名前で検索">
          <select class="select" id="f-role">
            <option value="">全属性</option>
            <option value="seller">出品</option>
            <option value="buyer">購入</option>
            <option value="both">両方</option>
          </select>
          <select class="select" id="f-status">
            <option value="">全ステータス</option>
            <option value="active">配信中</option>
            <option value="unsubscribed">配信停止</option>
            <option value="bounced">バウンス</option>
          </select>
          <select class="select" id="f-tag">
            <option value="">全タグ</option>
            ${this.cache.tags.map(t => `<option value="${t.id}">${this.escape(t.name)}</option>`).join('')}
          </select>
          <button class="btn btn-sm" onclick="App.loadSubscribers()">適用</button>
        </div>
        <div id="sub-table">
          <div class="loading">読み込み中...</div>
        </div>
      </div>
    `;
    ['f-q','f-role','f-status','f-tag'].forEach(id => {
      const el = document.getElementById(id);
      el.addEventListener('change', () => this.loadSubscribers());
      if (id === 'f-q') el.addEventListener('keydown', (e) => { if (e.key === 'Enter') this.loadSubscribers(); });
    });
    this.loadSubscribers();
  },

  async loadSubscribers(page = 1) {
    const q     = document.getElementById('f-q')?.value || '';
    const role  = document.getElementById('f-role')?.value || '';
    const status= document.getElementById('f-status')?.value || '';
    const tag   = document.getElementById('f-tag')?.value || '';
    const url = `/api/admin/subscribers?page=${page}&per_page=50&q=${encodeURIComponent(q)}&role=${role}&status=${status}&tag=${tag}`;
    const data = await this.api(url);
    const items = data.items || [];

    const html = `
      <table>
        <thead>
          <tr>
            <th>ID</th><th>メール</th><th>名前</th><th>属性</th><th>タグ</th><th>状態</th><th>登録日時</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${items.length ? items.map(r => `
            <tr>
              <td class="dim">#${r.id}</td>
              <td><a href="javascript:App.viewSubscriber(${r.id})" style="color:#a78bfa">${this.escape(r.email)}</a></td>
              <td>${this.escape(r.name) || '<span class="dim">-</span>'}</td>
              <td>${this.escape({seller:'🏪 出品',buyer:'🛒 購入',both:'✨ 両方'}[r.role] || '-')}</td>
              <td>${this.tagChips(r.tags)}</td>
              <td>${this.badge(r.status)}</td>
              <td class="muted">${this.fmtDate(r.created_at)}</td>
              <td class="actions">
                <button class="btn btn-sm" onclick="App.viewSubscriber(${r.id})">詳細</button>
              </td>
            </tr>
          `).join('') : `<tr><td colspan="8"><div class="empty">該当なし</div></td></tr>`}
        </tbody>
      </table>
      <div class="pagination">
        <div>${this.fmtNum(data.total)} 件中 ${(page-1)*50+1}-${Math.min(page*50, data.total)}</div>
        <div class="row">
          ${page > 1 ? `<button class="btn btn-sm" onclick="App.loadSubscribers(${page-1})">← 前へ</button>` : ''}
          ${page*50 < data.total ? `<button class="btn btn-sm" onclick="App.loadSubscribers(${page+1})">次へ →</button>` : ''}
        </div>
      </div>
    `;
    document.getElementById('sub-table').innerHTML = html;
  },

  async viewSubscriber(id) {
    const { item } = await this.api(`/api/admin/subscribers/${id}`);
    const events = item.events || [];
    const tagsHtml = item.tags?.map(t => `<span class="tag-chip" style="background:${this.hexAlpha(t.color,.15)};color:${t.color}">${this.escape(t.name)} <a href="javascript:App.detachTag(${id},${t.id})" style="margin-left:4px;color:#f87171">×</a></span>`).join('') || '<span class="dim">タグなし</span>';
    const tagOptions = this.cache.tags.filter(t => !item.tags?.find(x => x.id === t.id))
      .map(t => `<option value="${t.id}">${this.escape(t.name)}</option>`).join('');

    this.openModal(`登録者 #${id}: ${this.escape(item.email)}`, `
      <div class="form-row" style="grid-template-columns:1fr 1fr">
        <div><label>名前</label><div>${this.escape(item.name) || '-'}</div></div>
        <div><label>属性</label><div>${({seller:'🏪 出品',buyer:'🛒 購入',both:'✨ 両方'}[item.role] || '-')}</div></div>
        <div><label>興味</label><div>${this.escape(item.interest) || '-'}</div></div>
        <div><label>流入経路</label><div>${this.escape(item.source) || '-'}</div></div>
        <div><label>国</label><div>${this.escape(item.country) || '-'}</div></div>
        <div><label>ステータス</label><div>${this.badge(item.status)}</div></div>
      </div>

      <hr class="hr">
      <label>タグ</label>
      <div style="margin-bottom:10px">${tagsHtml}</div>
      <div class="row">
        <select class="select" id="add-tag" style="flex:1">
          <option value="">+ タグを追加</option>
          ${tagOptions}
        </select>
        <button class="btn btn-sm" onclick="App.attachTag(${id})">追加</button>
      </div>

      <hr class="hr">
      <label>最近のイベント (最大50件)</label>
      ${events.length ? `<table><thead><tr><th>種別</th><th>時刻</th><th>詳細</th></tr></thead><tbody>${events.map(e => `<tr><td>${this.eventBadge(e.event_type)}</td><td class="muted">${this.fmtDate(e.event_ts)}</td><td class="dim" style="font-size:11px">${this.escape((e.url || e.reason || '').slice(0,80))}</td></tr>`).join('')}</tbody></table>` : '<div class="dim">イベントなし</div>'}

      <hr class="hr">
      <div class="row" style="justify-content:space-between">
        <button class="btn btn-danger btn-sm" onclick="App.deleteSubscriber(${id})">この登録者を削除</button>
        <button class="btn" onclick="App.closeModal()">閉じる</button>
      </div>
    `);
  },

  eventBadge(t) {
    const map = {
      delivered:    'badge-active',
      open:         'badge-sent',
      click:        'badge-sent',
      bounce:       'badge-bounced',
      dropped:      'badge-bounced',
      spamreport:   'badge-bounced',
      unsubscribe:  'badge-unsub',
    };
    return `<span class="badge ${map[t] || 'badge-draft'}">${t}</span>`;
  },

  async attachTag(subId) {
    const tagId = document.getElementById('add-tag').value;
    if (!tagId) return;
    await this.api(`/api/admin/subscribers/${subId}/tags`, { method: 'POST', body: JSON.stringify({ tag_id: parseInt(tagId, 10) }) });
    this.showToast('タグを追加しました');
    this.viewSubscriber(subId);
  },
  async detachTag(subId, tagId) {
    await this.api(`/api/admin/subscribers/${subId}/tags`, { method: 'DELETE', body: JSON.stringify({ tag_id: tagId }) });
    this.showToast('タグを解除しました');
    this.viewSubscriber(subId);
  },
  async deleteSubscriber(id) {
    if (!confirm('本当に削除しますか？')) return;
    await this.api(`/api/admin/subscribers/${id}`, { method: 'DELETE' });
    this.showToast('削除しました');
    this.closeModal();
    this.loadSubscribers();
  },

  openNewSubscriber() {
    this.openModal('新規登録者を追加', `
      <div class="form-row">
        <div><label>メール *</label><input class="input" id="new-email" type="email"></div>
        <div><label>名前</label><input class="input" id="new-name" type="text"></div>
        <div><label>属性</label>
          <select class="select" id="new-role">
            <option value="">未選択</option><option value="seller">出品</option>
            <option value="buyer">購入</option><option value="both">両方</option>
          </select>
        </div>
      </div>
      <div class="row" style="justify-content:flex-end">
        <button class="btn" onclick="App.closeModal()">キャンセル</button>
        <button class="btn btn-primary" onclick="App.createSubscriber()">追加</button>
      </div>
    `);
  },
  async createSubscriber() {
    const email = document.getElementById('new-email').value.trim();
    if (!email) return this.showToast('メール必須', 'ng');
    try {
      await this.api('/api/admin/subscribers', {
        method: 'POST', body: JSON.stringify({
          email, name: document.getElementById('new-name').value.trim(), role: document.getElementById('new-role').value,
        }),
      });
      this.showToast('追加しました');
      this.closeModal();
      this.loadSubscribers();
    } catch (e) { this.showToast(e.message, 'ng'); }
  },

  async exportCsv() {
    const q = document.getElementById('f-q')?.value || '';
    const role = document.getElementById('f-role')?.value || '';
    const status = document.getElementById('f-status')?.value || '';
    const tag = document.getElementById('f-tag')?.value || '';
    const url = `${this.apiBase}/api/admin/subscribers/export?q=${encodeURIComponent(q)}&role=${role}&status=${status}&tag=${tag}`;
    window.location.href = url; // ブラウザがBasic認証を引き継いでダウンロード
  },

  // ============================================================
  //  画面: タグ
  // ============================================================
  async renderTags() {
    const { items } = await this.api('/api/admin/tags');
    this.view.innerHTML = `
      <div class="row" style="justify-content:space-between;margin-bottom:14px">
        <h2 class="section-title" style="margin:0">タグ・セグメント</h2>
        <button class="btn btn-primary" onclick="App.openNewTag()">+ 新規タグ</button>
      </div>
      <div class="grid grid-3">
        ${items.map(t => `
          <div class="card">
            <div class="row" style="justify-content:space-between;align-items:flex-start">
              <div>
                <span class="tag-chip" style="background:${this.hexAlpha(t.color,.15)};color:${t.color};border-color:${this.hexAlpha(t.color,.35)};font-size:13px;padding:4px 12px">${this.escape(t.name)}</span>
                <div class="muted" style="margin-top:6px;font-size:12px">${this.escape(t.description) || '<span class="dim">説明なし</span>'}</div>
              </div>
              <button class="btn-icon" onclick="App.editTag(${t.id},'${this.escape(t.name)}','${t.color}','${this.escape(t.description || '')}')">✎</button>
            </div>
            <hr class="hr">
            <div class="muted" style="font-size:12px">👥 ${t.subscriber_count} 名</div>
          </div>
        `).join('') || '<div class="empty">タグがありません</div>'}
      </div>
    `;
  },
  openNewTag() {
    this.openModal('新規タグ', this.tagFormHtml());
  },
  editTag(id, name, color, desc) {
    this.openModal('タグを編集', this.tagFormHtml({ id, name, color, desc }));
  },
  tagFormHtml(t = {}) {
    return `
      <div class="form-row">
        <div><label>名前 *</label><input class="input" id="tag-name" value="${this.escape(t.name || '')}"></div>
        <div><label>カラー</label><input class="input" id="tag-color" type="color" value="${t.color || '#a78bfa'}" style="height:42px;padding:4px"></div>
        <div><label>説明</label><input class="input" id="tag-desc" value="${this.escape(t.desc || '')}"></div>
      </div>
      <div class="row" style="justify-content:space-between">
        ${t.id ? `<button class="btn btn-danger btn-sm" onclick="App.deleteTag(${t.id})">削除</button>` : '<span></span>'}
        <div class="row">
          <button class="btn" onclick="App.closeModal()">キャンセル</button>
          <button class="btn btn-primary" onclick="App.saveTag(${t.id || 0})">保存</button>
        </div>
      </div>`;
  },
  async saveTag(id) {
    const body = {
      name: document.getElementById('tag-name').value.trim(),
      color: document.getElementById('tag-color').value,
      description: document.getElementById('tag-desc').value.trim(),
    };
    if (!body.name) return this.showToast('名前必須', 'ng');
    try {
      if (id) await this.api(`/api/admin/tags/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      else    await this.api(`/api/admin/tags`,        { method: 'POST', body: JSON.stringify(body) });
      this.showToast('保存しました'); this.closeModal(); this.renderTags();
    } catch (e) { this.showToast(e.message, 'ng'); }
  },
  async deleteTag(id) {
    if (!confirm('このタグを削除しますか？')) return;
    await this.api(`/api/admin/tags/${id}`, { method: 'DELETE' });
    this.showToast('削除しました'); this.closeModal(); this.renderTags();
  },

  async loadTagsCache() {
    if (this.cache.tags.length) return;
    const { items } = await this.api('/api/admin/tags');
    this.cache.tags = items;
  },

  // ============================================================
  //  画面: テンプレート
  // ============================================================
  async renderTemplates() {
    const { items } = await this.api('/api/admin/templates');
    this.view.innerHTML = `
      <div class="row" style="justify-content:space-between;margin-bottom:14px">
        <h2 class="section-title" style="margin:0">メールテンプレート</h2>
        <button class="btn btn-primary" onclick="App.editTemplate()">+ 新規テンプレート</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>名前</th><th>件名</th><th>カテゴリ</th><th>更新日</th><th></th></tr></thead>
          <tbody>
            ${items.length ? items.map(t => `
              <tr>
                <td class="dim">#${t.id}</td>
                <td>${this.escape(t.name)}</td>
                <td class="muted">${this.escape(t.subject)}</td>
                <td><span class="badge badge-draft">${this.escape(t.category)}</span></td>
                <td class="muted">${this.fmtDate(t.updated_at)}</td>
                <td class="actions">
                  <button class="btn btn-sm" onclick="App.editTemplate(${t.id})">編集</button>
                  <button class="btn btn-sm" onclick="App.useTemplateInCampaign(${t.id})">送信に使う</button>
                </td>
              </tr>`).join('') : '<tr><td colspan="6"><div class="empty">テンプレートがありません</div></td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  },
  async editTemplate(id) {
    let t = { name: '', subject: '', body_html: '', body_text: '', category: 'campaign' };
    if (id) {
      const r = await this.api(`/api/admin/templates/${id}`);
      t = r.item;
    }
    this.openModal(id ? `テンプレート編集 #${id}` : '新規テンプレート', `
      <div class="form-row">
        <div><label>名前 *</label><input class="input" id="t-name" value="${this.escape(t.name)}"></div>
        <div><label>件名 *</label><input class="input" id="t-subject" value="${this.escape(t.subject)}"></div>
        <div><label>カテゴリ</label>
          <select class="select" id="t-category">
            ${['campaign','thankyou','step','system'].map(c => `<option value="${c}" ${t.category===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <label>HTML本文 * (使用可能変数: <code>{{name}}</code> <code>{{email}}</code> <code>{{role}}</code>)</label>
      <div class="editor-grid">
        <div><textarea class="textarea" id="t-html" style="min-height:340px">${this.escape(t.body_html)}</textarea></div>
        <div><label class="muted">プレビュー</label><iframe id="t-preview"></iframe></div>
      </div>
      <label style="margin-top:10px">テキスト本文 (任意・HTML非対応クライアント向け)</label>
      <textarea class="textarea" id="t-text" style="min-height:100px">${this.escape(t.body_text || '')}</textarea>

      <div class="row" style="justify-content:space-between;margin-top:14px">
        ${id ? `<button class="btn btn-danger btn-sm" onclick="App.deleteTemplate(${id})">削除</button>` : '<span></span>'}
        <div class="row">
          <button class="btn" onclick="App.closeModal()">キャンセル</button>
          <button class="btn btn-primary" onclick="App.saveTemplate(${id || 0})">保存</button>
        </div>
      </div>
    `);
    const ta = document.getElementById('t-html');
    const iframe = document.getElementById('t-preview');
    const updatePreview = () => {
      iframe.srcdoc = ta.value || '<html><body style="font-family:sans-serif;padding:20px;color:#666">プレビュー</body></html>';
    };
    ta.addEventListener('input', updatePreview);
    updatePreview();
  },
  async saveTemplate(id) {
    const body = {
      name: document.getElementById('t-name').value.trim(),
      subject: document.getElementById('t-subject').value.trim(),
      body_html: document.getElementById('t-html').value,
      body_text: document.getElementById('t-text').value,
      category: document.getElementById('t-category').value,
    };
    if (!body.name || !body.subject || !body.body_html) return this.showToast('必須項目があります', 'ng');
    try {
      if (id) await this.api(`/api/admin/templates/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      else    await this.api(`/api/admin/templates`,        { method: 'POST', body: JSON.stringify(body) });
      this.showToast('保存しました'); this.closeModal(); this.renderTemplates();
    } catch (e) { this.showToast(e.message, 'ng'); }
  },
  async deleteTemplate(id) {
    if (!confirm('テンプレートを削除しますか？')) return;
    await this.api(`/api/admin/templates/${id}`, { method: 'DELETE' });
    this.showToast('削除しました'); this.closeModal(); this.renderTemplates();
  },

  useTemplateInCampaign(id) {
    sessionStorage.setItem('fp_use_template', id);
    location.hash = '#/campaigns';
  },

  // ============================================================
  //  画面: 手動メール送信
  // ============================================================
  async renderCampaigns() {
    await this.loadTagsCache();
    const { items: campaigns } = await this.api('/api/admin/campaigns');

    const useTplId = sessionStorage.getItem('fp_use_template');
    sessionStorage.removeItem('fp_use_template');

    this.view.innerHTML = `
      <h2 class="section-title">手動メール送信</h2>
      <p class="section-sub">条件を指定して登録者に一斉送信できます。</p>

      <div class="card">
        <div class="form-row">
          <div><label>キャンペーン名 (内部管理用)</label><input class="input" id="c-name" placeholder="例: 2026年6月号"></div>
          <div><label>件名 *</label><input class="input" id="c-subject" placeholder="メール件名"></div>
        </div>

        <label>テンプレートから読込</label>
        <div class="row" style="margin-bottom:14px">
          <button class="btn btn-sm" onclick="App.pickTemplate()">📄 テンプレ選択</button>
          <span class="dim">または直接以下に入力</span>
        </div>

        <label>HTML本文 * (変数: <code>{{name}}</code> <code>{{email}}</code> <code>{{role}}</code>)</label>
        <div class="editor-grid">
          <div><textarea class="textarea" id="c-html" style="min-height:320px"></textarea></div>
          <div><label class="muted">プレビュー</label><iframe id="c-preview"></iframe></div>
        </div>
        <label style="margin-top:10px">テキスト本文 (任意)</label>
        <textarea class="textarea" id="c-text" style="min-height:80px"></textarea>

        <hr class="hr">

        <label>配信対象</label>
        <div class="grid grid-2">
          <div>
            <label class="muted">属性で絞り込み (複数選択可)</label>
            <select class="select" id="c-roles" multiple size="4">
              <option value="seller">🏪 出品</option>
              <option value="buyer">🛒 購入</option>
              <option value="both">✨ 両方</option>
              <option value="">未選択</option>
            </select>
          </div>
          <div>
            <label class="muted">タグで絞り込み (複数選択可)</label>
            <select class="select" id="c-tags" multiple size="4">
              ${this.cache.tags.map(t => `<option value="${t.id}">${this.escape(t.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="muted" style="margin-top:8px;font-size:12px">※ どちらも未選択の場合は配信中の全員に送信されます</div>

        <hr class="hr">
        <div class="row" style="justify-content:flex-end">
          <button class="btn" onclick="App.previewRecipients()">📋 配信対象を確認</button>
          <button class="btn btn-primary" onclick="App.sendCampaign()">📨 送信実行</button>
        </div>
      </div>

      <h3 class="section-title" style="margin-top:30px;font-size:16px">送信履歴</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>キャンペーン名</th><th>件名</th><th>ステータス</th><th>送信数</th><th>失敗</th><th>送信日時</th></tr></thead>
          <tbody>
            ${campaigns.length ? campaigns.map(c => `
              <tr>
                <td class="dim">#${c.id}</td>
                <td><a href="javascript:App.viewCampaign(${c.id})" style="color:#a78bfa">${this.escape(c.name)}</a></td>
                <td class="muted">${this.escape(c.subject)}</td>
                <td><span class="badge badge-${c.status}">${c.status}</span></td>
                <td>${this.fmtNum(c.sent_count)}</td>
                <td>${c.failed_count ? `<span style="color:#f87171">${c.failed_count}</span>` : '-'}</td>
                <td class="muted">${this.fmtDate(c.sent_at || c.created_at)}</td>
              </tr>
            `).join('') : '<tr><td colspan="7"><div class="empty">まだ送信履歴がありません</div></td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    const ta = document.getElementById('c-html');
    const iframe = document.getElementById('c-preview');
    const update = () => iframe.srcdoc = ta.value || '<html><body style="font-family:sans-serif;padding:20px;color:#666">プレビュー</body></html>';
    ta.addEventListener('input', update);
    update();

    if (useTplId) await this.loadTemplateIntoForm(useTplId);
  },

  async pickTemplate() {
    const { items } = await this.api('/api/admin/templates');
    this.openModal('テンプレートを選択', `
      ${items.length ? items.map(t => `
        <div class="row" style="justify-content:space-between;padding:10px 0;border-bottom:1px solid #2a2a2a">
          <div><strong>${this.escape(t.name)}</strong><div class="muted" style="font-size:12px">${this.escape(t.subject)}</div></div>
          <button class="btn btn-sm" onclick="App.loadTemplateIntoForm(${t.id});App.closeModal();">選択</button>
        </div>
      `).join('') : '<div class="empty">テンプレートがありません</div>'}
    `);
  },
  async loadTemplateIntoForm(id) {
    const { item } = await this.api(`/api/admin/templates/${id}`);
    document.getElementById('c-subject').value = item.subject;
    document.getElementById('c-html').value = item.body_html;
    document.getElementById('c-text').value = item.body_text || '';
    document.getElementById('c-html').dispatchEvent(new Event('input'));
    this.showToast(`テンプレート「${item.name}」を読み込みました`);
  },

  async previewRecipients() {
    const target = this.buildTarget();
    // 簡易: 検索APIを叩いて件数だけ表示
    let count = 0;
    const tagId = target.tag_ids?.[0] || '';
    const role = target.roles?.[0] || '';
    const url = `/api/admin/subscribers?per_page=1&status=active&role=${role}&tag=${tagId}`;
    const r = await this.api(url);
    count = r.total || 0;
    this.showToast(`配信対象: ${count.toLocaleString()} 名`);
  },

  buildTarget() {
    const roles = Array.from(document.getElementById('c-roles').selectedOptions).map(o => o.value);
    const tag_ids = Array.from(document.getElementById('c-tags').selectedOptions).map(o => parseInt(o.value, 10));
    return { roles, tag_ids, status: 'active' };
  },

  async sendCampaign() {
    const body = {
      name: document.getElementById('c-name').value.trim() || `Campaign ${new Date().toISOString().slice(0,16)}`,
      subject: document.getElementById('c-subject').value.trim(),
      body_html: document.getElementById('c-html').value,
      body_text: document.getElementById('c-text').value,
      target: this.buildTarget(),
    };
    if (!body.subject || !body.body_html) return this.showToast('件名とHTML本文は必須', 'ng');
    if (!confirm(`本当に送信しますか?\n件名: ${body.subject}`)) return;

    this.showToast('送信中...');
    try {
      const r = await this.api('/api/admin/campaigns', { method: 'POST', body: JSON.stringify(body) });
      this.showToast(`✅ ${r.result.sent} 件送信完了 (失敗: ${r.result.failed})`);
      this.renderCampaigns();
    } catch (e) { this.showToast('送信失敗: ' + e.message, 'ng'); }
  },

  async viewCampaign(id) {
    const { item } = await this.api(`/api/admin/campaigns/${id}`);
    const stats = item.event_stats || [];
    const statRow = (n) => stats.find(s => s.event_type === n)?.cnt || 0;
    this.openModal(`キャンペーン #${id}`, `
      <div class="form-row" style="grid-template-columns:1fr 1fr">
        <div><label>名前</label><div>${this.escape(item.name)}</div></div>
        <div><label>ステータス</label><div><span class="badge badge-${item.status}">${item.status}</span></div></div>
        <div><label>件名</label><div>${this.escape(item.subject)}</div></div>
        <div><label>送信日時</label><div class="muted">${this.fmtDate(item.sent_at)}</div></div>
      </div>
      <hr class="hr">
      <label>配信統計</label>
      <div class="grid grid-4" style="margin-top:8px">
        <div class="card" style="padding:14px"><div class="card-title">配信完了</div><div style="font-size:22px;font-weight:700">${this.fmtNum(statRow('delivered'))}</div></div>
        <div class="card" style="padding:14px"><div class="card-title">開封</div><div style="font-size:22px;font-weight:700;color:#34d399">${this.fmtNum(statRow('open'))}</div></div>
        <div class="card" style="padding:14px"><div class="card-title">クリック</div><div style="font-size:22px;font-weight:700;color:#60a5fa">${this.fmtNum(statRow('click'))}</div></div>
        <div class="card" style="padding:14px"><div class="card-title">バウンス</div><div style="font-size:22px;font-weight:700;color:#f87171">${this.fmtNum(statRow('bounce'))}</div></div>
      </div>
      <hr class="hr">
      <label>送信内容プレビュー</label>
      <iframe srcdoc="${this.escape(item.body_html)}" style="width:100%;height:400px;background:#fff;border:1px solid #2a2a2a;border-radius:8px"></iframe>
    `);
  },

  // ============================================================
  //  画面: ステップメール
  // ============================================================
  async renderStepFlows() {
    const { items } = await this.api('/api/admin/step-flows');
    this.view.innerHTML = `
      <div class="row" style="justify-content:space-between;margin-bottom:14px">
        <h2 class="section-title" style="margin:0">ステップメール</h2>
        <button class="btn btn-primary" onclick="App.editStepFlow()">+ 新規フロー</button>
      </div>
      <p class="section-sub">登録などをトリガーに、指定時間後に自動でメールを送信します。<br>
      ※ 実際の自動送信は<strong>SendGrid Marketing → Automations</strong>での設定と連携運用となります（このページで定義したフローを参考にSendGrid側で構築してください）。</p>

      <div class="grid grid-2">
        ${items.length ? items.map(f => `
          <div class="card">
            <div class="row" style="justify-content:space-between;align-items:flex-start">
              <div>
                <strong style="font-size:15px">${this.escape(f.name)}</strong>
                <div class="muted" style="font-size:12px;margin-top:4px">${this.escape(f.description) || '<span class="dim">説明なし</span>'}</div>
              </div>
              <span class="badge badge-${f.status === 'active' ? 'active' : 'unsub'}">${f.status === 'active' ? '稼働中' : '停止中'}</span>
            </div>
            <hr class="hr">
            <div class="muted" style="font-size:12px">
              トリガー: <code>${this.escape(f.trigger_type)}</code><br>
              ステップ数: ${f.step_count}<br>
              更新: ${this.fmtDate(f.updated_at)}
            </div>
            <div class="row" style="margin-top:12px;justify-content:flex-end">
              <button class="btn btn-sm" onclick="App.toggleStepFlow(${f.id})">${f.status === 'active' ? '⏸ 停止' : '▶ 再開'}</button>
              <button class="btn btn-sm" onclick="App.editStepFlow(${f.id})">編集</button>
            </div>
          </div>
        `).join('') : '<div class="empty">ステップメールフローがありません</div>'}
      </div>
    `;
  },
  async toggleStepFlow(id) {
    const r = await this.api(`/api/admin/step-flows/${id}/toggle`, { method: 'POST' });
    this.showToast(`ステータスを ${r.status} に変更しました`);
    this.renderStepFlows();
  },
  async editStepFlow(id) {
    let f = { name: '', description: '', trigger_type: 'on_signup', trigger_value: '', steps: [] };
    if (id) {
      const r = await this.api(`/api/admin/step-flows/${id}`);
      f = r.item;
    }
    this.openModal(id ? `ステップフロー編集 #${id}` : '新規ステップフロー', `
      <div class="form-row">
        <div><label>フロー名 *</label><input class="input" id="sf-name" value="${this.escape(f.name)}"></div>
        <div><label>説明</label><input class="input" id="sf-desc" value="${this.escape(f.description || '')}"></div>
        <div><label>トリガー</label>
          <select class="select" id="sf-trigger">
            <option value="on_signup" ${f.trigger_type==='on_signup'?'selected':''}>登録時 (on_signup)</option>
            <option value="on_tag_added" ${f.trigger_type==='on_tag_added'?'selected':''}>タグ付与時 (on_tag_added)</option>
          </select>
        </div>
        <div><label>SendGrid Automation ID (任意・連携時に記入)</label><input class="input" id="sf-sg-id" value="${this.escape(f.sendgrid_automation_id || '')}"></div>
      </div>

      <hr class="hr">
      <label>ステップ</label>
      <div id="steps-list">
        ${(f.steps || []).map((s, i) => this.stepRow(s, i)).join('')}
      </div>
      <button class="btn btn-sm" onclick="App.addStepRow()" style="margin-top:8px">+ ステップを追加</button>

      <div class="row" style="justify-content:space-between;margin-top:14px">
        ${id ? `<button class="btn btn-danger btn-sm" onclick="App.deleteStepFlow(${id})">削除</button>` : '<span></span>'}
        <div class="row">
          <button class="btn" onclick="App.closeModal()">キャンセル</button>
          <button class="btn btn-primary" onclick="App.saveStepFlow(${id || 0})">保存</button>
        </div>
      </div>
    `);
  },
  stepRow(s = {}, i = 0) {
    return `<div class="step-row card" style="padding:12px;margin-bottom:8px">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <strong>Step ${i + 1}</strong>
        <button class="btn-icon" onclick="this.parentElement.parentElement.remove()">✕</button>
      </div>
      <div class="form-row" style="grid-template-columns:120px 1fr">
        <div><label>遅延時間 (h)</label><input class="input step-delay" type="number" value="${s.delay_hours || 24}"></div>
        <div><label>件名 *</label><input class="input step-subject" value="${this.escape(s.subject || '')}"></div>
      </div>
      <label>HTML本文 *</label>
      <textarea class="textarea step-html" style="min-height:120px">${this.escape(s.body_html || '')}</textarea>
    </div>`;
  },
  addStepRow() {
    const list = document.getElementById('steps-list');
    const idx = list.children.length;
    list.insertAdjacentHTML('beforeend', this.stepRow({}, idx));
  },
  collectSteps() {
    const steps = [];
    document.querySelectorAll('.step-row').forEach(row => {
      steps.push({
        delay_hours: parseInt(row.querySelector('.step-delay').value, 10) || 24,
        subject: row.querySelector('.step-subject').value.trim(),
        body_html: row.querySelector('.step-html').value,
        body_text: '',
      });
    });
    return steps;
  },
  async saveStepFlow(id) {
    const body = {
      name: document.getElementById('sf-name').value.trim(),
      description: document.getElementById('sf-desc').value.trim(),
      trigger_type: document.getElementById('sf-trigger').value,
      sendgrid_automation_id: document.getElementById('sf-sg-id').value.trim(),
      steps: this.collectSteps(),
    };
    if (!body.name) return this.showToast('フロー名必須', 'ng');
    if (body.steps.some(s => !s.subject || !s.body_html)) return this.showToast('各ステップに件名と本文が必要', 'ng');
    try {
      if (id) await this.api(`/api/admin/step-flows/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      else    await this.api(`/api/admin/step-flows`,        { method: 'POST', body: JSON.stringify(body) });
      this.showToast('保存しました'); this.closeModal(); this.renderStepFlows();
    } catch (e) { this.showToast(e.message, 'ng'); }
  },
  async deleteStepFlow(id) {
    if (!confirm('フローを削除しますか?')) return;
    await this.api(`/api/admin/step-flows/${id}`, { method: 'DELETE' });
    this.showToast('削除しました'); this.closeModal(); this.renderStepFlows();
  },

  // ============================================================
  //  画面: 設定
  // ============================================================
  renderSettings() {
    this.view.innerHTML = `
      <h2 class="section-title">設定</h2>

      <div class="card">
        <div class="card-title">APIエンドポイント</div>
        <p class="muted" style="font-size:12px;margin-bottom:10px">この管理画面が接続するWorkers APIのURLです。Workersをデプロイしたら更新してください。</p>
        <div class="row">
          <input class="input" id="set-api" value="${this.escape(this.apiBase)}" style="flex:1">
          <button class="btn btn-primary" onclick="App.saveApiBase()">保存</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">埋め込みウィジェット</div>
        <p class="muted" style="font-size:12px;margin-bottom:10px">既存ページに以下のコードを貼り付けるとフォームが表示されます。</p>
        <div class="preview">&lt;!-- 表示位置に1つ配置 --&gt;
&lt;div data-firstpen-form data-theme="dark" data-title="ウェイトリスト登録"&gt;&lt;/div&gt;

&lt;!-- ページ末尾に1度だけ --&gt;
&lt;script src="${this.apiBase}/widget.js" defer&gt;&lt;/script&gt;</div>
        <div class="muted" style="font-size:11px;margin-top:8px">
          <strong>属性:</strong>
          <code>data-theme</code>="dark | light"  /
          <code>data-title</code>="任意のタイトル"  /
          <code>data-subtitle</code>="任意のサブタイトル"
        </div>
      </div>

      <div class="card">
        <div class="card-title">SendGrid Event Webhook URL</div>
        <p class="muted" style="font-size:12px;margin-bottom:10px">SendGrid側のEvent Webhook設定でこのURLを登録すると、開封/クリック/バウンス等が自動でDBに記録されます。</p>
        <div class="preview">${this.apiBase}/api/sendgrid/webhook</div>
        <div class="muted" style="font-size:11px;margin-top:8px">
          SendGrid Dashboard → Settings → Mail Settings → Event Webhook で上記URLを設定し、対象イベント (delivered/open/click/bounce/dropped/unsubscribe/spamreport) を有効化してください。
        </div>
      </div>

      <div class="card">
        <div class="card-title">SendGrid Marketing → Automations 連携</div>
        <p class="muted" style="font-size:12px;line-height:1.8">
          現在の構成では、ステップメールの<strong>定義はこの管理画面で行い</strong>、<br>
          実際の自動配信は <strong>SendGrid Marketing Campaigns の Automation 機能</strong> で実行します。<br><br>
          <strong>連携手順:</strong><br>
          1. SendGrid Dashboard → Marketing → Automations で新規Automationを作成<br>
          2. このページで定義した各ステップを SendGrid 側にコピーして反映<br>
          3. SendGrid側のAutomation IDをコピー<br>
          4. 当画面のフロー編集で「SendGrid Automation ID」欄に貼り付けて保存<br>
        </p>
      </div>
    `;
  },
  saveApiBase() {
    const v = document.getElementById('set-api').value.trim().replace(/\/$/, '');
    localStorage.setItem('fp_admin_api', v);
    this.apiBase = v;
    this.showToast('保存しました');
    this.healthCheck();
  },
};

// ============================================================
//  Chart.js 共通オプション
// ============================================================
function chartOpts() {
  return {
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#888', font: { size: 11 } }, grid: { color: '#222' } },
      y: { ticks: { color: '#888', font: { size: 11 } }, grid: { color: '#222' }, beginAtZero: true },
    },
  };
}

// 起動
window.App = App;
document.addEventListener('DOMContentLoaded', () => App.start());

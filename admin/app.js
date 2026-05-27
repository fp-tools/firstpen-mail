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
    'newsletters':      { title: 'メールマガジン',     fn: 'renderNewsletters' },
    'scenario-flows':   { title: 'シナリオフロー',   fn: 'renderScenarioFlows' },
    'campaigns':        { title: '手動メール送信',   fn: 'renderCampaigns' },
    'step-flows':       { title: 'ステップメール',   fn: 'renderStepFlows' },
    'sender-settings':  { title: '送信者設定',       fn: 'renderSenderSettings' },
    'settings':         { title: '設定',             fn: 'renderSettings' },
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

  openModal(title, html, wide = false) {
    this.modalTitle.textContent = title;
    this.modalBody.innerHTML = html;
    this.modal.classList.remove('hidden');
    this.modal.querySelector('.modal-panel').style.maxWidth = wide ? '860px' : '';
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
          borderColor: '#ffffff', borderWidth: 2,
        }],
      },
      options: { plugins: { legend: { labels: { color: '#374151', font: { size: 12 } } } }, cutout: '65%' },
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
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:4px">
        <label style="margin:0">HTML本文 * (変数: <code>{{name}}</code> <code>{{email}}</code> <code>{{role}}</code>)</label>
        <button class="btn btn-sm" onclick="App.openGrapesEditor('t-html')">🎨 ビジュアルエディタ</button>
      </div>
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
    const [{ items: campaigns }, { items: senders }] = await Promise.all([
      this.api('/api/admin/campaigns'),
      this.api('/api/admin/sender-settings'),
    ]);

    const useTplId = sessionStorage.getItem('fp_use_template');
    sessionStorage.removeItem('fp_use_template');

    this.view.innerHTML = `
      <h2 class="section-title">手動メール送信</h2>
      <p class="section-sub">条件を指定して登録者に一斉送信できます。</p>

      <div class="card">
        <div class="form-row">
          <div><label>キャンペーン名 (内部管理用)</label><input class="input" id="c-name" placeholder="例: 2026年6月号"></div>
          <div><label>件名 *</label><input class="input" id="c-subject" placeholder="メール件名"></div>
          <div><label>送信元 (From)</label>
            <select class="select" id="c-sender">
              <option value="">デフォルト送信者</option>
              ${senders.map(s => `<option value="${s.id}" ${s.is_default ? 'selected' : ''}>${this.escape(s.from_name)} &lt;${this.escape(s.from_email)}&gt;</option>`).join('')}
            </select>
          </div>
        </div>

        <label>テンプレートから読込</label>
        <div class="row" style="margin-bottom:14px">
          <button class="btn btn-sm" onclick="App.pickTemplate()">📄 テンプレ選択</button>
          <span class="dim">または直接以下に入力</span>
        </div>

        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:4px">
          <label style="margin:0">HTML本文 * (変数: <code>{{name}}</code> <code>{{email}}</code> <code>{{role}}</code>)</label>
          <button class="btn btn-sm" onclick="App.openGrapesEditor('c-html')">🎨 ビジュアルエディタ</button>
        </div>
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
          <button class="btn" onclick="App.openTestSend()">🧪 テスト送信</button>
          <button class="btn btn-primary" onclick="App.openSendConfirm()">📨 送信実行</button>
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
    const senderId = parseInt(document.getElementById('c-sender')?.value, 10) || null;
    const body = {
      name: document.getElementById('c-name').value.trim() || `Campaign ${new Date().toISOString().slice(0,16)}`,
      subject: document.getElementById('c-subject').value.trim(),
      body_html: document.getElementById('c-html').value,
      body_text: document.getElementById('c-text').value,
      target: this.buildTarget(),
      ...(senderId ? { from_sender_id: senderId } : {}),
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
  //  テスト送信 / 確認画面
  // ============================================================
  openTestSend() {
    const subject  = document.getElementById('c-subject')?.value || '';
    const bodyHtml = document.getElementById('c-html')?.value || '';
    if (!subject || !bodyHtml) return this.showToast('件名とHTML本文を先に入力してください', 'ng');
    this.openModal('🧪 テスト送信', `
      <p class="muted" style="font-size:12px;margin-bottom:12px">
        件名の前に [テスト] が付き、変数は仮データに置換されて送信されます。
      </p>
      <div class="form-row">
        <div><label>送信先メールアドレス *</label>
          <input class="input" id="test-to" type="email" placeholder="test@example.com" value="${this.escape(localStorage.getItem('fp_test_to') || '')}">
        </div>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:12px">
        <button class="btn" onclick="App.closeModal()">キャンセル</button>
        <button class="btn btn-primary" onclick="App.doTestSend()">送信</button>
      </div>
    `);
  },

  async doTestSend() {
    const to = document.getElementById('test-to')?.value.trim();
    if (!to) return this.showToast('送信先を入力してください', 'ng');
    localStorage.setItem('fp_test_to', to);
    const senderId = parseInt(document.getElementById('c-sender')?.value, 10) || null;
    const body = {
      to,
      subject: document.getElementById('c-subject').value,
      body_html: document.getElementById('c-html').value,
      body_text: document.getElementById('c-text')?.value || '',
      ...(senderId ? { from_sender_id: senderId } : {}),
    };
    this.showToast('テスト送信中...');
    try {
      await this.api('/api/admin/campaigns/test', { method: 'POST', body: JSON.stringify(body) });
      this.showToast(`✅ ${to} へテスト送信しました`);
      this.closeModal();
    } catch (e) { this.showToast('送信失敗: ' + e.message, 'ng'); }
  },

  async openSendConfirm() {
    const subject  = document.getElementById('c-subject')?.value.trim();
    const bodyHtml = document.getElementById('c-html')?.value;
    if (!subject || !bodyHtml) return this.showToast('件名とHTML本文は必須', 'ng');
    const target   = this.buildTarget();
    const senderId = parseInt(document.getElementById('c-sender')?.value, 10) || null;
    const senderText = document.getElementById('c-sender')?.options[document.getElementById('c-sender').selectedIndex]?.text || 'デフォルト';
    const tagId  = target.tag_ids?.[0] || '';
    const role   = target.roles?.[0]   || '';
    const r = await this.api(`/api/admin/subscribers?per_page=1&status=active&role=${role}&tag=${tagId}`);
    const count = r.total || 0;
    this.openModal('📨 送信確認', `
      <div class="grid grid-2" style="margin-bottom:16px">
        <div class="card" style="padding:14px"><div class="card-title">件名</div><div>${this.escape(subject)}</div></div>
        <div class="card" style="padding:14px"><div class="card-title">From</div><div class="muted">${this.escape(senderText)}</div></div>
        <div class="card" style="padding:14px"><div class="card-title">配信対象</div><div style="font-size:22px;font-weight:700;color:#7c3aed">${count.toLocaleString()} 名</div></div>
        <div class="card" style="padding:14px"><div class="card-title">プレビュー</div><div class="muted" style="font-size:11px">${this.escape(bodyHtml.replace(/<[^>]+>/g,'').slice(0,80))}...</div></div>
      </div>
      ${count === 0 ? '<p style="color:#f87171;font-size:12px">⚠️ 配信対象が0件です。絞り込み条件を確認してください。</p>' : ''}
      <div class="row" style="justify-content:flex-end">
        <button class="btn" onclick="App.closeModal()">キャンセル</button>
        <button class="btn btn-primary" ${count===0?'disabled':''} onclick="App.closeModal();App.sendCampaign();">この内容で送信する</button>
      </div>
    `);
  },

  // ============================================================
  //  GrapesJS ビジュアルエディタ
  // ============================================================
  openGrapesEditor(targetId, callback) {
    if (typeof grapesjs === 'undefined') {
      return this.showToast('エディタの読み込み中です。しばらくお待ちください', 'ng');
    }
    const existing = document.getElementById(targetId)?.value || '';
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;background:#fff';
    const bar = document.createElement('div');
    bar.style.cssText = 'height:52px;background:#1e1e2e;display:flex;align-items:center;padding:0 20px;gap:12px;flex-shrink:0';
    bar.innerHTML = `
      <span style="color:#fff;font-weight:600;font-size:15px">🎨 ビジュアルエディタ</span>
      <div style="flex:1"></div>
      <button id="gjs-cancel-btn" style="padding:8px 18px;background:#4b5563;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">キャンセル</button>
      <button id="gjs-save-btn" style="padding:8px 18px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">✓ 保存してHTMLに反映</button>
    `;
    const wrap = document.createElement('div');
    wrap.id = 'gjs-wrap';
    wrap.style.cssText = 'flex:1;overflow:hidden';
    overlay.appendChild(bar);
    overlay.appendChild(wrap);
    document.body.appendChild(overlay);

    const editor = grapesjs.init({
      container: '#gjs-wrap',
      height: '100%',
      width: '100%',
      plugins: ['grapesjs-preset-newsletter'],
      pluginsOpts: { 'grapesjs-preset-newsletter': { inlineCss: true } },
      storageManager: false,
      components: existing || '<p>ここにコンテンツを追加してください</p>',
      style: '',
    });

    document.getElementById('gjs-save-btn').addEventListener('click', () => {
      const html = editor.runCommand('gjs-get-inlined-html') || `<style>${editor.getCss()}</style>${editor.getHtml()}`;
      const el = document.getElementById(targetId);
      if (el) {
        el.value = html;
        el.dispatchEvent(new Event('input'));
      }
      if (typeof callback === 'function') callback(html);
      editor.destroy();
      overlay.remove();
    });
    document.getElementById('gjs-cancel-btn').addEventListener('click', () => {
      editor.destroy();
      overlay.remove();
    });
  },

  // ============================================================
  //  画面: メールマガジン
  // ============================================================
  async renderNewsletters() {
    const [{ items }, { items: senders }] = await Promise.all([
      this.api('/api/admin/newsletters'),
      this.api('/api/admin/sender-settings'),
    ]);
    this.view.innerHTML = `
      <div class="row" style="justify-content:space-between;margin-bottom:14px">
        <h2 class="section-title" style="margin:0">メールマガジン</h2>
        <button class="btn btn-primary" onclick="App.editNewsletter(null, ${JSON.stringify(JSON.stringify(senders)).slice(1,-1)})">+ 新規作成</button>
      </div>
      <p class="section-sub">メールマガジンごとに購読者を管理し、シナリオフローを紐付けられます。</p>
      <div class="grid grid-2">
        ${items.length ? items.map(n => `
          <div class="card">
            <div class="row" style="justify-content:space-between;align-items:flex-start">
              <div>
                <strong style="font-size:15px">${this.escape(n.name)}</strong>
                <div class="muted" style="font-size:12px;margin-top:2px">slug: <code>${this.escape(n.slug)}</code></div>
                <div class="muted" style="font-size:12px;margin-top:2px">${this.escape(n.description) || '<span class="dim">説明なし</span>'}</div>
              </div>
              <span class="badge badge-${n.status === 'active' ? 'active' : 'unsub'}">${n.status}</span>
            </div>
            <hr class="hr">
            <div class="row" style="justify-content:space-between;align-items:center">
              <div class="muted" style="font-size:12px">👥 ${n.subscriber_count} 名購読中</div>
              <div class="row">
                <button class="btn btn-sm" onclick="App.viewNewsletter(${n.id})">詳細</button>
                <button class="btn btn-sm" onclick="App.editNewsletter(${n.id})">編集</button>
              </div>
            </div>
          </div>
        `).join('') : '<div class="empty">メールマガジンがありません</div>'}
      </div>
    `;
  },

  async viewNewsletter(id) {
    const { item } = await this.api(`/api/admin/newsletters/${id}`);
    const { items: subs } = await this.api(`/api/admin/newsletters/${id}/subscriptions`);
    const { items: allSubs } = await this.api('/api/admin/subscribers?per_page=200&status=active');
    const subIds = new Set(subs.map(s => s.subscriber_id));
    const unsubscribed = allSubs.filter(s => !subIds.has(s.id));
    this.openModal(`📰 ${this.escape(item.name)}`, `
      <div class="row" style="justify-content:space-between;margin-bottom:14px">
        <div><strong>購読者: ${subs.filter(s=>s.status==='active').length} 名</strong></div>
        <div class="row">
          <select class="select" id="nl-add-sub" style="min-width:200px">
            <option value="">-- 購読者を追加 --</option>
            ${unsubscribed.map(s => `<option value="${s.id}">${this.escape(s.email)}</option>`).join('')}
          </select>
          <button class="btn btn-sm btn-primary" onclick="App.addNlSubscriber(${id})">追加</button>
        </div>
      </div>
      <div style="max-height:300px;overflow-y:auto">
        <table>
          <thead><tr><th>メール</th><th>名前</th><th>状態</th><th>登録日</th><th></th></tr></thead>
          <tbody>
            ${subs.length ? subs.map(s => `
              <tr>
                <td>${this.escape(s.email)}</td>
                <td>${this.escape(s.name) || '-'}</td>
                <td><span class="badge badge-${s.status==='active'?'active':'unsub'}">${s.status}</span></td>
                <td class="muted">${this.fmtDate(s.opted_in_at)}</td>
                <td><button class="btn btn-sm" onclick="App.removeNlSubscriber(${id},${s.subscriber_id})">削除</button></td>
              </tr>
            `).join('') : '<tr><td colspan="5"><div class="empty">購読者なし</div></td></tr>'}
          </tbody>
        </table>
      </div>
      ${item.flows?.length ? `<hr class="hr"><label>紐付きシナリオ</label><div>${item.flows.map(f=>`<span class="badge badge-draft" style="margin-right:6px">${this.escape(f.name)}</span>`).join('')}</div>` : ''}
    `);
  },

  async addNlSubscriber(nlId) {
    const sid = document.getElementById('nl-add-sub')?.value;
    if (!sid) return;
    await this.api(`/api/admin/newsletters/${nlId}/subscribe`, { method: 'POST', body: JSON.stringify({ subscriber_ids: [parseInt(sid)] }) });
    this.showToast('追加しました');
    this.viewNewsletter(nlId);
  },

  async removeNlSubscriber(nlId, sid) {
    await this.api(`/api/admin/newsletters/${nlId}/unsubscribe`, { method: 'POST', body: JSON.stringify({ subscriber_ids: [sid] }) });
    this.showToast('削除しました');
    this.viewNewsletter(nlId);
  },

  async editNewsletter(id) {
    const { items: senders } = await this.api('/api/admin/sender-settings');
    let n = { name: '', description: '', slug: '', status: 'active', from_sender_id: null, reply_to: '' };
    if (id) { const r = await this.api(`/api/admin/newsletters/${id}`); n = r.item; }
    this.openModal(id ? `マガジン編集 #${id}` : '新規マガジン', `
      <div class="form-row">
        <div><label>名前 *</label><input class="input" id="nl-name" value="${this.escape(n.name)}"></div>
        <div><label>スラッグ * (URL用・英数字)</label><input class="input" id="nl-slug" value="${this.escape(n.slug)}" ${id?'readonly':''}></div>
        <div><label>説明</label><input class="input" id="nl-desc" value="${this.escape(n.description)}"></div>
        <div><label>送信元</label>
          <select class="select" id="nl-sender">
            <option value="">デフォルト</option>
            ${senders.map(s=>`<option value="${s.id}" ${n.from_sender_id==s.id?'selected':''}>${this.escape(s.from_name)} &lt;${this.escape(s.from_email)}&gt;</option>`).join('')}
          </select>
        </div>
        <div><label>ステータス</label>
          <select class="select" id="nl-status">
            <option value="active" ${n.status==='active'?'selected':''}>active</option>
            <option value="paused" ${n.status==='paused'?'selected':''}>paused</option>
          </select>
        </div>
      </div>
      <div class="row" style="justify-content:flex-end;margin-top:14px">
        <button class="btn" onclick="App.closeModal()">キャンセル</button>
        <button class="btn btn-primary" onclick="App.saveNewsletter(${id||0})">保存</button>
      </div>
    `);
  },

  async saveNewsletter(id) {
    const b = {
      name: document.getElementById('nl-name').value.trim(),
      slug: document.getElementById('nl-slug').value.trim(),
      description: document.getElementById('nl-desc').value.trim(),
      from_sender_id: parseInt(document.getElementById('nl-sender').value)||null,
      status: document.getElementById('nl-status').value,
    };
    if (!b.name || !b.slug) return this.showToast('名前とスラッグは必須', 'ng');
    try {
      if (id) await this.api(`/api/admin/newsletters/${id}`, { method: 'PUT', body: JSON.stringify(b) });
      else    await this.api('/api/admin/newsletters',       { method: 'POST', body: JSON.stringify(b) });
      this.showToast('保存しました'); this.closeModal(); this.renderNewsletters();
    } catch (e) { this.showToast(e.message, 'ng'); }
  },

  // ============================================================
  //  画面: シナリオフロー
  // ============================================================
  async renderScenarioFlows() {
    const [{ items }, { items: newsletters }] = await Promise.all([
      this.api('/api/admin/scenario-flows'),
      this.api('/api/admin/newsletters'),
    ]);
    this.view.innerHTML = `
      <div class="row" style="justify-content:space-between;margin-bottom:14px">
        <h2 class="section-title" style="margin:0">シナリオフロー</h2>
        <button class="btn btn-primary" onclick="App.editScenario()">+ 新規フロー</button>
      </div>
      <p class="section-sub">購読・開封・クリックをトリガーに自動メール配信。条件分岐で異なるシナリオを実行できます。</p>
      <div class="grid grid-2">
        ${items.length ? items.map(f => `
          <div class="card">
            <div class="row" style="justify-content:space-between;align-items:flex-start">
              <div>
                <strong>${this.escape(f.name)}</strong>
                <div class="muted" style="font-size:12px;margin-top:4px">
                  トリガー: <code>${f.trigger_type}</code>
                  ${f.newsletter_name ? ` / ${this.escape(f.newsletter_name)}` : ''}
                </div>
              </div>
              <span class="badge badge-${f.status==='active'?'active':'unsub'}">${f.status}</span>
            </div>
            <hr class="hr">
            <div class="row" style="justify-content:space-between;font-size:12px;align-items:center">
              <div class="muted">ステップ: ${f.step_count}件 / 実行中: ${f.active_count}件</div>
              <div class="row">
                <button class="btn btn-sm" onclick="App.startScenario(${f.id})">▶ 開始</button>
                <button class="btn btn-sm" onclick="App.editScenario(${f.id})">編集</button>
              </div>
            </div>
          </div>
        `).join('') : '<div class="empty">シナリオフローがありません</div>'}
      </div>
    `;
    this._nlList = newsletters;
  },

  async editScenario(id) {
    const nlList = this._nlList || (await this.api('/api/admin/newsletters')).items;
    let f = { name: '', description: '', trigger_type: 'on_subscribe', newsletter_id: null, status: 'active', steps: [] };
    if (id) { const r = await this.api(`/api/admin/scenario-flows/${id}`); f = r.item; }
    this.openModal(id ? `シナリオ編集 #${id}` : '新規シナリオ', `
      <div class="form-row">
        <div><label>フロー名 *</label><input class="input" id="sc-name" value="${this.escape(f.name)}"></div>
        <div><label>説明</label><input class="input" id="sc-desc" value="${this.escape(f.description||'')}"></div>
        <div><label>トリガー</label>
          <select class="select" id="sc-trigger">
            <option value="on_subscribe" ${f.trigger_type==='on_subscribe'?'selected':''}>購読時 (on_subscribe)</option>
            <option value="manual"       ${f.trigger_type==='manual'?'selected':''}>手動起動</option>
          </select>
        </div>
        <div><label>対象マガジン</label>
          <select class="select" id="sc-nl">
            <option value="">未設定</option>
            ${nlList.map(n=>`<option value="${n.id}" ${f.newsletter_id==n.id?'selected':''}>${this.escape(n.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <hr class="hr">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
        <label style="margin:0">ステップ</label>
        <div class="row">
          <button class="btn btn-sm" onclick="App.addScStep('email')">+ メール</button>
          <button class="btn btn-sm" onclick="App.addScStep('condition')">+ 条件分岐</button>
          <button class="btn btn-sm" onclick="App.addScStep('wait')">+ 待機</button>
        </div>
      </div>
      <div id="sc-steps">
        ${(f.steps||[]).map((s,i)=>this.scStepRow(s,i)).join('')}
      </div>
      <div class="row" style="justify-content:space-between;margin-top:14px">
        ${id ? `<button class="btn btn-danger btn-sm" onclick="App.deleteScenario(${id})">削除</button>` : '<span></span>'}
        <div class="row">
          <button class="btn" onclick="App.closeModal()">キャンセル</button>
          <button class="btn btn-primary" onclick="App.saveScenario(${id||0})">保存</button>
        </div>
      </div>
    `, true);
  },

  scStepRow(s = {}, i = 0) {
    const type = s.step_type || 'email';
    const typeLabel = { email: '📧 メール', condition: '🔀 条件分岐', wait: '⏱ 待機' }[type] || type;
    return `<div class="card sc-step-row" style="padding:12px;margin-bottom:8px" data-type="${type}">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <strong style="font-size:13px">Step ${i+1}: ${typeLabel}</strong>
        <div class="row">
          <span class="muted" style="font-size:11px">order: <input type="number" class="input sc-order" style="width:60px;padding:2px 6px;font-size:11px" value="${s.step_order ?? i}"></span>
          <button class="btn-icon" onclick="this.closest('.sc-step-row').remove()">✕</button>
        </div>
      </div>
      <input type="hidden" class="sc-type" value="${type}">
      <div class="form-row" style="grid-template-columns:120px 1fr;gap:8px">
        <div><label style="font-size:11px">遅延(h)</label><input class="input sc-delay" type="number" value="${s.delay_hours||0}" style="font-size:12px"></div>
        ${type === 'email' ? `
          <div><label style="font-size:11px">件名 *</label><input class="input sc-subject" value="${this.escape(s.subject||'')}" style="font-size:12px"></div>
        ` : type === 'condition' ? `
          <div><label style="font-size:11px">条件</label>
            <select class="select sc-condition-type" style="font-size:12px">
              <option value="opened" ${s.condition_type==='opened'?'selected':''}>開封した</option>
              <option value="clicked" ${s.condition_type==='clicked'?'selected':''}>クリックした</option>
              <option value="not_opened" ${s.condition_type==='not_opened'?'selected':''}>開封しなかった</option>
              <option value="not_clicked" ${s.condition_type==='not_clicked'?'selected':''}>クリックしなかった</option>
            </select>
          </div>
        ` : '<div></div>'}
      </div>
      ${type === 'email' ? `
        <div class="row" style="justify-content:space-between;align-items:center;margin:4px 0">
          <label style="font-size:11px;margin:0">HTML本文 *</label>
          <button class="btn btn-sm" style="font-size:11px" onclick="App.openGrapesEditor(null, html => this.closest('.sc-step-row').querySelector('.sc-html').value = html)">🎨 エディタ</button>
        </div>
        <textarea class="textarea sc-html" style="min-height:100px;font-size:12px">${this.escape(s.body_html||'')}</textarea>
      ` : type === 'condition' ? `
        <div class="form-row" style="grid-template-columns:1fr 1fr;gap:8px;margin-top:6px">
          <div><label style="font-size:11px">TRUE → Step order</label><input class="input sc-yes" type="number" value="${s.yes_next_order??''}" style="font-size:12px" placeholder="次のorder番号"></div>
          <div><label style="font-size:11px">FALSE → Step order</label><input class="input sc-no" type="number" value="${s.no_next_order??''}" style="font-size:12px" placeholder="次のorder番号"></div>
        </div>
        <div style="margin-top:4px"><label style="font-size:11px">判定対象のStep order</label><input class="input sc-cond-step" type="number" value="${s.condition_step_order??''}" style="font-size:12px" placeholder="判定するステップのorder"></div>
      ` : ''}
    </div>`;
  },

  addScStep(type) {
    const list = document.getElementById('sc-steps');
    const idx = list.children.length;
    list.insertAdjacentHTML('beforeend', this.scStepRow({ step_type: type }, idx));
  },

  collectScSteps() {
    return Array.from(document.querySelectorAll('.sc-step-row')).map(row => ({
      step_type: row.querySelector('.sc-type')?.value || 'email',
      step_order: parseInt(row.querySelector('.sc-order')?.value, 10) || 0,
      delay_hours: parseInt(row.querySelector('.sc-delay')?.value, 10) || 0,
      subject: row.querySelector('.sc-subject')?.value.trim() || '',
      body_html: row.querySelector('.sc-html')?.value || '',
      body_text: '',
      condition_type: row.querySelector('.sc-condition-type')?.value || '',
      condition_step_order: parseInt(row.querySelector('.sc-cond-step')?.value, 10) || null,
      yes_next_order: parseInt(row.querySelector('.sc-yes')?.value, 10) || null,
      no_next_order: parseInt(row.querySelector('.sc-no')?.value, 10) || null,
    }));
  },

  async saveScenario(id) {
    const body = {
      name: document.getElementById('sc-name').value.trim(),
      description: document.getElementById('sc-desc').value.trim(),
      trigger_type: document.getElementById('sc-trigger').value,
      newsletter_id: parseInt(document.getElementById('sc-nl').value)||null,
      status: 'active',
      steps: this.collectScSteps(),
    };
    if (!body.name) return this.showToast('フロー名必須', 'ng');
    try {
      if (id) await this.api(`/api/admin/scenario-flows/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      else    await this.api('/api/admin/scenario-flows',       { method: 'POST', body: JSON.stringify(body) });
      this.showToast('保存しました'); this.closeModal(); this.renderScenarioFlows();
    } catch (e) { this.showToast(e.message, 'ng'); }
  },

  async deleteScenario(id) {
    if (!confirm('フローを削除しますか?')) return;
    await this.api(`/api/admin/scenario-flows/${id}`, { method: 'DELETE' });
    this.showToast('削除しました'); this.closeModal(); this.renderScenarioFlows();
  },

  async startScenario(flowId) {
    const nlId = prompt('対象マガジンID（空の場合は全購読者を手動入力）:');
    const body = nlId ? { newsletter_id: parseInt(nlId) } : {};
    try {
      const r = await this.api(`/api/admin/scenario-flows/${flowId}/start`, { method: 'POST', body: JSON.stringify(body) });
      this.showToast(`${r.started} 件のワークフローを開始しました`);
    } catch (e) { this.showToast(e.message, 'ng'); }
  },

  // ============================================================
  //  画面: 送信者設定
  // ============================================================
  async renderSenderSettings() {
    const { items } = await this.api('/api/admin/sender-settings');
    this.view.innerHTML = `
      <div class="row" style="justify-content:space-between;margin-bottom:14px">
        <h2 class="section-title" style="margin:0">送信者設定</h2>
        <div class="row">
          <button class="btn" onclick="App.syncSenders()">🔄 SendGridから同期</button>
          <button class="btn btn-primary" onclick="App.openNewSender()">+ 追加</button>
        </div>
      </div>
      <p class="section-sub">SendGridで事前に承認されたFromアドレスを管理します。送信時にここで設定したアドレスを選択できます。</p>

      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>メールアドレス</th><th>表示名</th><th>ステータス</th><th>デフォルト</th><th>SG Sender ID</th><th></th></tr></thead>
          <tbody>
            ${items.length ? items.map(s => `
              <tr>
                <td class="dim">#${s.id}</td>
                <td>${this.escape(s.from_email)}</td>
                <td>${this.escape(s.from_name) || '<span class="dim">-</span>'}</td>
                <td><span class="badge badge-${s.status === 'verified' ? 'active' : 'unsub'}">${this.escape(s.status)}</span></td>
                <td>${s.is_default ? '<span class="badge badge-sent">デフォルト</span>' : `<button class="btn btn-sm" onclick="App.setDefaultSender(${s.id})">設定</button>`}</td>
                <td class="dim">${s.sendgrid_sender_id || '-'}</td>
                <td class="actions">
                  <button class="btn btn-sm" onclick="App.editSender(${s.id},'${this.escape(s.from_email)}','${this.escape(s.from_name)}',${s.sendgrid_sender_id||'null'})">編集</button>
                  ${s.is_default ? '' : `<button class="btn btn-sm btn-danger" onclick="App.deleteSender(${s.id})">削除</button>`}
                </td>
              </tr>
            `).join('') : '<tr><td colspan="7"><div class="empty">送信者が登録されていません</div></td></tr>'}
          </tbody>
        </table>
      </div>
    `;
  },

  openNewSender() {
    this.openModal('送信者を追加', this.senderFormHtml());
  },
  editSender(id, email, name, sgId) {
    this.openModal('送信者を編集', this.senderFormHtml({ id, email, name, sgId }));
  },
  senderFormHtml(s = {}) {
    return `
      <div class="form-row">
        <div><label>メールアドレス *</label><input class="input" id="s-email" type="email" value="${this.escape(s.email || '')}" ${s.id ? 'readonly' : ''}></div>
        <div><label>表示名 *</label><input class="input" id="s-name" value="${this.escape(s.name || '')}"></div>
        <div><label>SendGrid Sender ID (任意)</label><input class="input" id="s-sgid" type="number" value="${s.sgId || ''}"></div>
      </div>
      <div class="row" style="justify-content:space-between">
        ${s.id ? `<button class="btn btn-danger btn-sm" onclick="App.deleteSender(${s.id})">削除</button>` : '<span></span>'}
        <div class="row">
          <button class="btn" onclick="App.closeModal()">キャンセル</button>
          <button class="btn btn-primary" onclick="App.saveSender(${s.id || 0})">保存</button>
        </div>
      </div>`;
  },
  async saveSender(id) {
    const body = {
      from_email: document.getElementById('s-email').value.trim(),
      from_name: document.getElementById('s-name').value.trim(),
      sendgrid_sender_id: parseInt(document.getElementById('s-sgid').value, 10) || null,
    };
    if (!body.from_email || !body.from_name) return this.showToast('メールアドレスと表示名は必須', 'ng');
    try {
      if (id) await this.api(`/api/admin/sender-settings/${id}`, { method: 'PUT', body: JSON.stringify(body) });
      else    await this.api('/api/admin/sender-settings',         { method: 'POST', body: JSON.stringify(body) });
      this.showToast('保存しました'); this.closeModal(); this.renderSenderSettings();
    } catch (e) { this.showToast(e.message, 'ng'); }
  },
  async deleteSender(id) {
    if (!confirm('この送信者を削除しますか？')) return;
    try {
      await this.api(`/api/admin/sender-settings/${id}`, { method: 'DELETE' });
      this.showToast('削除しました'); this.closeModal(); this.renderSenderSettings();
    } catch (e) { this.showToast(e.message, 'ng'); }
  },
  async setDefaultSender(id) {
    try {
      await this.api(`/api/admin/sender-settings/${id}/default`, { method: 'POST' });
      this.showToast('デフォルト送信者を変更しました'); this.renderSenderSettings();
    } catch (e) { this.showToast(e.message, 'ng'); }
  },
  async syncSenders() {
    this.showToast('SendGridと同期中...');
    try {
      const r = await this.api('/api/admin/sender-settings/sync', { method: 'POST' });
      this.showToast(`同期完了 (${r.synced} 件)`); this.renderSenderSettings();
    } catch (e) { this.showToast('同期失敗: ' + e.message, 'ng'); }
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
        <div class="card-title">SendGrid セットアップ</div>
        <p class="muted" style="font-size:12px;margin-bottom:14px">SendGrid側の各設定をここから一括で実行できます。</p>

        <div class="row" style="gap:14px;flex-wrap:wrap">
          <div class="card" style="flex:1;min-width:220px;padding:16px">
            <div class="card-title" style="font-size:13px">Event Webhook 自動設定</div>
            <p class="muted" style="font-size:11px;margin:6px 0 12px">開封・クリック・バウンスの自動記録URLをSendGridに登録します。</p>
            <button class="btn btn-primary btn-sm" onclick="App.setupWebhook()">⚡ Webhook を設定</button>
            <div id="webhook-result" style="margin-top:8px;font-size:11px"></div>
          </div>

          <div class="card" style="flex:1;min-width:220px;padding:16px">
            <div class="card-title" style="font-size:13px">Marketing Contacts 一括同期</div>
            <p class="muted" style="font-size:11px;margin:6px 0 12px">配信中の登録者全員をSendGrid Contactsに同期します（最大10,000件）。</p>
            <button class="btn btn-primary btn-sm" onclick="App.syncContacts()">🔄 Contacts を同期</button>
            <div id="contacts-result" style="margin-top:8px;font-size:11px"></div>
          </div>

          <div class="card" style="flex:1;min-width:220px;padding:16px">
            <div class="card-title" style="font-size:13px">Verified Sender 新規申請</div>
            <p class="muted" style="font-size:11px;margin:6px 0 6px">新しいFromアドレスを申請します。SendGridから確認メールが届くのでクリックで認証完了。</p>
            <div class="form-row" style="grid-template-columns:1fr;gap:6px;margin-bottom:8px">
              <input class="input" id="vs-email" type="email" placeholder="from@example.com" style="font-size:12px">
              <input class="input" id="vs-name"  type="text"  placeholder="表示名 (例: FirstPen事務局)" style="font-size:12px">
            </div>
            <button class="btn btn-sm" onclick="App.requestVerifiedSender()">📧 申請する</button>
            <div id="sender-req-result" style="margin-top:8px;font-size:11px"></div>
          </div>
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
  async setupWebhook() {
    const el = document.getElementById('webhook-result');
    el.textContent = '設定中...';
    try {
      const r = await this.api('/api/admin/sendgrid/webhook-setup', { method: 'POST' });
      el.style.color = '#10b981';
      el.textContent = `✅ 設定完了: ${r.url}`;
      this.showToast('Webhook を設定しました');
    } catch (e) { el.style.color = '#f87171'; el.textContent = '❌ ' + e.message; }
  },

  async syncContacts() {
    const el = document.getElementById('contacts-result');
    el.textContent = '同期中...';
    try {
      const r = await this.api('/api/admin/sendgrid/contacts-sync', { method: 'POST' });
      el.style.color = '#10b981';
      el.textContent = `✅ ${r.synced.toLocaleString()} 件同期完了`;
      if (r.errors?.length) el.textContent += ` (エラー: ${r.errors.join(', ')})`;
      this.showToast(`${r.synced.toLocaleString()} 件をSendGridに同期しました`);
    } catch (e) { el.style.color = '#f87171'; el.textContent = '❌ ' + e.message; }
  },

  async requestVerifiedSender() {
    const el = document.getElementById('sender-req-result');
    const from_email = document.getElementById('vs-email').value.trim();
    const from_name  = document.getElementById('vs-name').value.trim();
    if (!from_email || !from_name) { el.style.color = '#f87171'; el.textContent = 'メールアドレスと表示名を入力してください'; return; }
    el.textContent = '申請中...';
    try {
      const r = await this.api('/api/admin/sendgrid/sender-request', {
        method: 'POST', body: JSON.stringify({ from_email, from_name }),
      });
      el.style.color = '#10b981';
      el.textContent = `✅ ${r.note}`;
      this.showToast('確認メールを送信しました');
    } catch (e) { el.style.color = '#f87171'; el.textContent = '❌ ' + e.message; }
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
      x: { ticks: { color: '#6b7280', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,.07)' } },
      y: { ticks: { color: '#6b7280', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,.07)' }, beginAtZero: true },
    },
  };
}

// 起動
window.App = App;
document.addEventListener('DOMContentLoaded', () => App.start());

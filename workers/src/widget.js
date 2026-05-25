/**
 * 埋め込み用JSウィジェット
 * 既存ページに <script src=".../widget.js" defer></script> を貼り付けるだけで
 * data-firstpen-form 属性を持つ要素にフォームが描画される。
 */
export function widgetScript(env) {
  const apiBase = `${env.API_BASE || ''}`; // 例: https://firstpen-waitlist-api.xxx.workers.dev

  const code = `
(function(){
  const API_BASE = "${apiBase}";
  const CSS = \`
    .fp-form { box-sizing:border-box; max-width:480px; margin:0 auto; padding:28px 24px; background:#141414; border:1px solid #2a2a2a; border-radius:16px; font-family:'Hiragino Sans','Yu Gothic',sans-serif; color:#f5f5f5; }
    .fp-form *, .fp-form *::before, .fp-form *::after { box-sizing:border-box; }
    .fp-form h3 { margin:0 0 4px; font-size:18px; color:#fff; font-weight:700; }
    .fp-form .fp-sub { color:#999; font-size:12px; margin-bottom:18px; }
    .fp-form .fp-field { margin-bottom:14px; }
    .fp-form label { display:block; font-size:11px; color:#bbb; margin-bottom:5px; letter-spacing:.04em; }
    .fp-form .fp-req { color:#ef4444; margin-left:3px; }
    .fp-form input[type=text], .fp-form input[type=email], .fp-form select { width:100%; padding:11px 12px; background:#0e0e0e; border:1px solid #2a2a2a; color:#f5f5f5; border-radius:8px; font-size:13px; outline:none; font-family:inherit; }
    .fp-form input:focus, .fp-form select:focus { border-color:#a78bfa; background:#111; }
    .fp-form input::placeholder { color:#555; }
    .fp-form .fp-roles { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; }
    .fp-form .fp-roles label { position:relative; cursor:pointer; margin:0; }
    .fp-form .fp-roles input { position:absolute; opacity:0; pointer-events:none; }
    .fp-form .fp-roles span { display:block; text-align:center; padding:10px 4px; border:1px solid #2a2a2a; border-radius:8px; font-size:12px; color:#bbb; background:#0e0e0e; transition:.15s; }
    .fp-form .fp-roles input:checked + span { border-color:#a78bfa; color:#fff; background:rgba(167,139,250,.1); }
    .fp-form .fp-consent { display:flex; align-items:flex-start; gap:8px; font-size:11px; color:#999; margin:14px 0 6px; line-height:1.6; }
    .fp-form .fp-consent input { margin-top:2px; accent-color:#a78bfa; }
    .fp-form .fp-consent a { color:#a78bfa; }
    .fp-form button { width:100%; padding:13px; margin-top:10px; background:linear-gradient(135deg,#7c3aed,#a78bfa); color:#fff; border:0; border-radius:999px; font-weight:700; font-size:14px; cursor:pointer; font-family:inherit; }
    .fp-form button:hover { opacity:.92; }
    .fp-form button:disabled { opacity:.55; cursor:not-allowed; }
    .fp-form .fp-alert { margin-top:10px; padding:10px 12px; border-radius:8px; font-size:12px; display:none; }
    .fp-form .fp-alert.show { display:block; }
    .fp-form .fp-ok { background:rgba(16,185,129,.1); border:1px solid rgba(16,185,129,.4); color:#34d399; }
    .fp-form .fp-ng { background:rgba(239,68,68,.1); border:1px solid rgba(239,68,68,.4); color:#f87171; }
    .fp-form .fp-foot { margin-top:10px; text-align:center; font-size:10px; color:#666; }
    .fp-form .fp-light { background:#fff; color:#111; border-color:#e5e5e5; }
    .fp-form.fp-light h3 { color:#111; }
    .fp-form.fp-light input, .fp-form.fp-light select, .fp-form.fp-light .fp-roles span { background:#f8f8f8; border-color:#e5e5e5; color:#111; }
    .fp-form.fp-light .fp-sub, .fp-form.fp-light label, .fp-form.fp-light .fp-foot { color:#666; }
  \`;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const FORM_HTML = (opts) => \`
    <form class="fp-form\${opts.theme === 'light' ? ' fp-light' : ''}" novalidate>
      <h3>\${opts.title || 'ウェイティングリストに登録'}</h3>
      <div class="fp-sub">\${opts.subtitle || '1分で完了 · 完全無料'}</div>

      <div class="fp-field">
        <label>メールアドレス<span class="fp-req">*</span></label>
        <input type="email" name="email" required autocomplete="email" placeholder="you@example.com">
      </div>
      <div class="fp-field">
        <label>お名前 (ニックネーム可)</label>
        <input type="text" name="name" autocomplete="name" placeholder="例: 山田 太郎">
      </div>
      <div class="fp-field">
        <label>ご利用予定<span class="fp-req">*</span></label>
        <div class="fp-roles">
          <label><input type="radio" name="role" value="seller" required><span>🏪 出品</span></label>
          <label><input type="radio" name="role" value="buyer"><span>🛒 購入</span></label>
          <label><input type="radio" name="role" value="both"><span>✨ 両方</span></label>
        </div>
      </div>
      <div class="fp-field">
        <label>興味のあるカテゴリ (任意)</label>
        <select name="interest">
          <option value="">選択してください</option>
          <option value="writing">✍️ 文章生成</option>
          <option value="image">🎨 画像・動画</option>
          <option value="automation">🤖 業務自動化</option>
          <option value="analysis">📊 データ分析</option>
          <option value="marketing">📣 マーケティング</option>
          <option value="other">🔧 その他</option>
        </select>
      </div>

      <label class="fp-consent">
        <input type="checkbox" name="agreed" required>
        <span>利用規約およびプライバシーポリシーに同意し、FirstPenからのお知らせを受け取ります。</span>
      </label>

      <button type="submit">無料で先行登録する →</button>

      <div class="fp-alert fp-ok"></div>
      <div class="fp-alert fp-ng"></div>
      <div class="fp-foot">Powered by FirstPen</div>
    </form>
  \`;

  function mount(el) {
    const theme = el.getAttribute('data-theme') || 'dark';
    const title = el.getAttribute('data-title');
    const subtitle = el.getAttribute('data-subtitle');
    el.innerHTML = FORM_HTML({ theme, title, subtitle });
    const form = el.querySelector('form');
    const btn  = form.querySelector('button');
    const ok   = form.querySelector('.fp-ok');
    const ng   = form.querySelector('.fp-ng');

    function alert(type, msg) {
      [ok, ng].forEach(a => a.classList.remove('show'));
      const t = type === 'ok' ? ok : ng;
      t.textContent = msg; t.classList.add('show');
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      [ok, ng].forEach(a => a.classList.remove('show'));
      const fd = new FormData(form);
      const data = {
        email: fd.get('email')?.toString().trim() || '',
        name:  fd.get('name')?.toString().trim() || '',
        role:  fd.get('role')?.toString() || '',
        interest: fd.get('interest')?.toString() || '',
        source:   document.referrer || location.hostname,
        agreed: fd.get('agreed') === 'on',
      };
      if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(data.email)) return alert('ng', '有効なメールアドレスを入力してください');
      if (!data.role)   return alert('ng', 'ご利用予定を選択してください');
      if (!data.agreed) return alert('ng', '利用規約への同意が必要です');

      btn.disabled = true; const orig = btn.textContent; btn.textContent = '登録中...';
      try {
        const res = await fetch(API_BASE + '/api/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        const j = await res.json().catch(() => ({}));
        if (res.ok && j.ok) {
          form.style.display = 'none';
          el.insertAdjacentHTML('beforeend',
            '<div class="fp-form" style="text-align:center;padding:40px 24px;"><div style="font-size:42px;">🎉</div><h3>ご登録ありがとうございます！</h3><p style="color:#999;margin-top:12px;font-size:13px;line-height:1.7;">確認メールをお送りしました。<br>届かない場合は迷惑メールフォルダもご確認ください。</p></div>');
        } else {
          alert('ng', j.error || '登録に失敗しました');
          btn.disabled = false; btn.textContent = orig;
        }
      } catch (err) {
        alert('ng', 'ネットワークエラーが発生しました');
        btn.disabled = false; btn.textContent = orig;
      }
    });
  }

  function init() {
    document.querySelectorAll('[data-firstpen-form]').forEach(mount);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 公開API
  window.FirstPen = { mount, init };
})();
`;
  return new Response(code, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

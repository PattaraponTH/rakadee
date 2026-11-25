// ตั้งค่าระบบ (api-spec 11.8, 11.9, requirement 8.1) — เจ้าของ: PM · Super Admin เท่านั้น
// บันทึกแล้วทุกการเปลี่ยนแปลงลง Audit Log (SETTING_UPDATE) พร้อมค่าเดิม/ค่าใหม่
(() => {
  const $ = (id) => document.getElementById(id);
  const GROUPS = {
    'fee-rows': ['platform_fee_percent', 'platform_fee_min'],
    'wallet-rows': ['initial_wallet_credit'],
    'doc-rows': ['terms_version', 'privacy_version'],
  };
  const NUMERIC = ['platform_fee_percent', 'platform_fee_min', 'initial_wallet_credit'];
  const SAMPLE_PRICES = [100, 400, 1000, 5000];
  let saved = {};
  const inputs = {};

  const baht = (n) => `฿${Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const when = (v) => (v ? new Date(v).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : null);

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function showAlert(message, type = 'error') {
    $('alert').replaceChildren();
    if (!message) return;
    const div = el('div', `alert alert-${type}`, message);
    div.setAttribute('role', 'alert');
    $('alert').append(div);
  }

  // สูตรเดียวกับ escrow.calculatePlatformFee (คิดเป็นสตางค์)
  function fee(price, percent, min) {
    const item = Math.round(price * 100);
    const f = Math.min(Math.max(Math.round((item * Math.round(percent * 100)) / 10000), Math.round(min * 100)), item);
    return f / 100;
  }

  function renderPreview() {
    const p = Number(inputs.platform_fee_percent.value);
    const m = Number(inputs.platform_fee_min.value);
    const ok = Number.isFinite(p) && Number.isFinite(m) && inputs.platform_fee_percent.value !== '' && inputs.platform_fee_min.value !== '';
    $('preview').replaceChildren(...SAMPLE_PRICES.map((price) => {
      const tr = el('tr');
      const f = ok ? fee(price, p, m) : null;
      tr.append(el('td', null, baht(price)), el('td', null, ok ? baht(f) : '-'), el('td', null, ok ? baht(price - f) : '-'));
      return tr;
    }));
  }

  function markDirty() {
    const dirty = Object.keys(inputs).filter((k) => inputs[k].value.trim() !== saved[k]);
    Object.keys(inputs).forEach((k) => inputs[k].closest('.set-row').classList.toggle('changed', dirty.includes(k)));
    $('dirty-note').textContent = dirty.length ? `แก้ไขแล้ว ${dirty.length} รายการ ยังไม่ได้บันทึก` : '';
    $('save').disabled = !dirty.length;
    renderPreview();
  }

  function render(d) {
    saved = { ...d.settings };
    const byKey = Object.fromEntries(d.items.map((i) => [i.key, i]));
    Object.entries(GROUPS).forEach(([host, keys]) => {
      $(host).replaceChildren(...keys.map((key) => {
        const item = byKey[key];
        const row = el('div', 'set-row');
        const left = el('div');
        const label = el('label', null, item.label);
        label.htmlFor = `set-${key}`;
        left.append(label, el('div', 'meta', item.hint));
        const updated = when(item.updatedAt);
        if (updated && item.updatedBy) left.append(el('div', 'meta', `แก้ล่าสุด ${updated} โดย ${item.updatedBy.displayName}`));
        const right = el('div');
        const input = el('input');
        input.id = `set-${key}`;
        input.name = key;
        input.value = item.value;
        input.inputMode = NUMERIC.includes(key) ? 'decimal' : 'text';
        input.setAttribute('aria-describedby', `err-${key}`);
        input.addEventListener('input', markDirty);
        inputs[key] = input;
        const err = el('div', 'field-error');
        err.id = `err-${key}`;
        right.append(input);
        row.append(left, right, err);
        return row;
      }));
    });
    markDirty();
  }

  function validate() {
    const errors = {};
    const money = /^\d{1,10}(\.\d{1,2})?$/;
    const version = /^\d{1,3}(\.\d{1,3}){0,2}$/;
    const v = (k) => inputs[k].value.trim();
    if (!money.test(v('platform_fee_percent')) || Number(v('platform_fee_percent')) > 100) errors.platform_fee_percent = 'ตัวเลข 0–100 ทศนิยมไม่เกิน 2 ตำแหน่ง';
    if (!money.test(v('platform_fee_min')) || Number(v('platform_fee_min')) > 100000) errors.platform_fee_min = 'ตัวเลข 0–100,000 ทศนิยมไม่เกิน 2 ตำแหน่ง';
    if (!money.test(v('initial_wallet_credit')) || Number(v('initial_wallet_credit')) > 1000000) errors.initial_wallet_credit = 'ตัวเลข 0–1,000,000 ทศนิยมไม่เกิน 2 ตำแหน่ง';
    if (!version.test(v('terms_version'))) errors.terms_version = 'รูปแบบเลขเวอร์ชัน เช่น 1.0';
    if (!version.test(v('privacy_version'))) errors.privacy_version = 'รูปแบบเลขเวอร์ชัน เช่น 1.0';
    return errors;
  }

  function showErrors(errors) {
    Object.keys(inputs).forEach((k) => { $(`err-${k}`).textContent = errors[k] || ''; });
  }

  async function load() {
    try {
      render(await api.get('/admin/settings'));
    } catch (e) {
      showAlert(e.message);
    }
  }

  document.addEventListener('user:ready', (e) => {
    const u = e.detail;
    if (!u) { location.href = `/pages/login.html?next=${encodeURIComponent(location.pathname)}`; return; }
    // ไม่ใช่แอดมิน → หน้าแรก · แอดมินทั่วไป → Dashboard (หน้านี้เฉพาะ Super Admin, BE ตรวจซ้ำที่ 11.8–11.9)
    if (u.role !== 'admin' && u.role !== 'super_admin') { location.href = '/'; return; }
    if (u.role !== 'super_admin') { location.href = '/pages/admin/dashboard.html'; return; }
    $('revert').addEventListener('click', () => { Object.keys(inputs).forEach((k) => { inputs[k].value = saved[k]; }); showErrors({}); markDirty(); });
    $('form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      showAlert('');
      const errors = validate();
      showErrors(errors);
      if (Object.keys(errors).length) return;
      const changes = Object.fromEntries(Object.keys(inputs).filter((k) => inputs[k].value.trim() !== saved[k]).map((k) => [k, inputs[k].value.trim()]));
      if (!Object.keys(changes).length) return;
      $('save').disabled = true;
      try {
        const d = await api.put('/admin/settings', { settings: changes });
        render(d);
        showAlert(`บันทึกแล้ว ${d.changed.length} รายการ (บันทึกลง Audit Log แล้ว)`, 'success');
      } catch (ex) {
        if (ex.details) showErrors(ex.details);
        showAlert(ex.message);
        markDirty();
      }
    });
    load();
  });
})();

// หน้าตั้งค่า: โปรไฟล์ ความปลอดภัย ที่อยู่ การแจ้งเตือน (api-spec 1.12–1.14, 2.1–2.10) — เจ้าของ: PM
(() => {
  const $ = (id) => document.getElementById(id);
  const isMember = (u) => u && (u.role === 'bidder' || u.role === 'seller');
  let me = null;

  // ---------------------------------------------------------------- helpers
  function alertMsg(type, message) {
    const box = $('alert');
    box.replaceChildren();
    if (!message) return;
    const div = document.createElement('div');
    div.className = `alert alert-${type}`;
    div.textContent = message;
    box.appendChild(div);
    if (type === 'success') setTimeout(() => { if (box.firstChild === div) div.remove(); }, 4000);
  }

  function clearErrors(form) {
    form.querySelectorAll('[data-error]').forEach((s) => { s.textContent = ''; });
    form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
  }

  function showErrors(form, details) {
    Object.entries(details || {}).forEach(([field, msg]) => {
      const slot = form.querySelector(`[data-error="${field}"]`);
      if (slot) slot.textContent = msg;
      const input = form.querySelector(`[name="${field}"]`) || form.querySelector(`#${field}`);
      if (input) input.setAttribute('aria-invalid', 'true');
    });
  }

  function handleError(err, form) {
    if (form && err.code === 'VALIDATION_ERROR' && err.details) {
      showErrors(form, err.details);
      alertMsg('error', 'กรุณาตรวจสอบข้อมูลที่กรอก');
    } else if (err.status === 404 && err.code === 'NOT_FOUND' && /ไม่พบ (GET|POST|PUT|DELETE)/.test(err.message)) {
      alertMsg('error', 'ฟีเจอร์นี้จะใช้ได้เมื่อระบบสมาชิกของ SA พร้อม');
    } else {
      alertMsg('error', err.message);
    }
  }

  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  const maskPhone = (p) => (p && p.length === 10 ? `${p.slice(0, 3)}-***-${p.slice(6)}` : p || '');
  const fmtPhone = (p) => (p && p.length === 10 ? `${p.slice(0, 3)}-${p.slice(3, 6)}-${p.slice(6)}` : p || '');

  // ---------------------------------------------------------------- tabs
  function openTab(name) {
    document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.id !== `tab-${name}`; });
    alertMsg('', '');
    if (history.replaceState) history.replaceState(null, '', `#${name}`);
    if (name === 'security') loadSessions();
    if (name === 'addresses') loadAddresses();
    if (name === 'notifications') loadNotifSettings();
  }

  // ---------------------------------------------------------------- profile
  function renderAvatar() {
    const box = $('avatar-preview');
    box.replaceChildren();
    if (me.avatarUrl) {
      const img = document.createElement('img');
      img.src = me.avatarUrl;
      img.alt = 'รูปโปรไฟล์';
      box.appendChild(img);
    } else {
      box.textContent = (me.displayName || '?').slice(0, 1).toUpperCase();
    }
    $('avatar-remove').hidden = !me.avatarUrl;
  }

  function renderProfile() {
    $('displayName').value = me.displayName || '';
    $('bio').value = me.bio || '';
    $('username').value = me.username;
    $('email').value = me.email;
    $('phone').value = maskPhone(me.phone);
    $('idcard').value = me.idCardLast4 ? `*********${me.idCardLast4}` : '-';
    $('email-status').textContent = me.emailVerified ? 'ยืนยันแล้ว (Verified)' : 'ยังไม่ยืนยันอีเมล';
    $('email-status').className = me.emailVerified ? 'badge-verified' : 'hint';
    $('phone-status').textContent = me.phoneVerified ? 'ยืนยันแล้ว (Verified)' : 'ยังไม่ยืนยันเบอร์โทร';
    $('phone-status').className = me.phoneVerified ? 'badge-verified' : 'hint';
    renderAvatar();
    loadPublicPreview();
  }

  // ตัวอย่างข้อมูลสาธารณะ (2.11) แสดงเฉพาะสมาชิก (แอดมินไม่มีหน้าโปรไฟล์สาธารณะ)
  async function loadPublicPreview() {
    const card = $('public-card');
    if (!card || !isMember(me)) return;
    const box = $('public-preview');
    try {
      const p = await api.get(`/users/${me.id}/public`);
      const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
      const avatar = mk('span', 'avatar lg');
      if (p.avatarUrl) { const img = mk('img'); img.src = p.avatarUrl; img.alt = ''; avatar.appendChild(img); }
      else avatar.textContent = (p.displayName || '?').slice(0, 1).toUpperCase();
      const info = mk('div', 'info');
      info.append(mk('span', 'name', p.displayName));
      const badges = mk('div', 'badges');
      if (p.isSeller) badges.append(mk('span', 'badge', 'ผู้ขาย'));
      if (p.emailVerified) badges.append(mk('span', 'badge badge-success', 'ยืนยันอีเมลแล้ว'));
      if (p.phoneVerified) badges.append(mk('span', 'badge badge-success', 'ยืนยันเบอร์แล้ว'));
      info.append(badges);
      if (p.joinedAt) info.append(mk('span', 'hint', `สมาชิกตั้งแต่ ${new Date(p.joinedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}`));
      info.append(mk('p', 'bio', p.bio || 'ยังไม่มีคำแนะนำตัว'));
      if (p.isSeller) {
        const a = mk('a', '', 'ดูหน้าร้านแบบที่ผู้ซื้อเห็น');
        a.href = `/pages/seller-profile.html?id=${p.id}`;
        info.append(a);
      }
      box.replaceChildren(avatar, info);
      card.hidden = false;
    } catch {
      card.hidden = true;
    }
  }

  async function saveProfile(e) {
    e.preventDefault();
    const form = e.target;
    clearErrors(form);
    const body = { displayName: $('displayName').value.trim(), bio: $('bio').value.trim() };
    if (body.displayName.length < 2) return showErrors(form, { displayName: 'ชื่อที่แสดงต้องยาว 2–50 ตัวอักษร' });
    try {
      me = await api.patch('/users/me', body);
      renderProfile();
      alertMsg('success', 'บันทึกข้อมูลส่วนตัวแล้ว');
    } catch (err) {
      handleError(err, form);
    }
  }

  async function uploadAvatar(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) return alertMsg('error', 'รองรับเฉพาะไฟล์ .jpg, .jpeg และ .png');
    if (file.size > 5 * 1024 * 1024) return alertMsg('error', 'ไฟล์ต้องไม่เกิน 5 MB');
    const fd = new FormData();
    fd.append('avatar', file);
    try {
      const d = await api.upload('/users/me/avatar', fd);
      me.avatarUrl = d.avatarUrl;
      renderAvatar();
      loadPublicPreview();
      alertMsg('success', 'เปลี่ยนรูปโปรไฟล์แล้ว');
    } catch (err) {
      handleError(err);
    }
  }

  async function removeAvatar() {
    if (!confirm('ลบรูปโปรไฟล์?')) return;
    try {
      await api.del('/users/me/avatar');
      me.avatarUrl = null;
      renderAvatar();
      loadPublicPreview();
      alertMsg('success', 'ลบรูปโปรไฟล์แล้ว');
    } catch (err) {
      handleError(err);
    }
  }

  // ---------------------------------------------------------------- security (SA)
  async function changePassword(e) {
    e.preventDefault();
    const form = e.target;
    clearErrors(form);
    const body = { currentPassword: $('currentPassword').value, newPassword: $('newPassword').value };
    const errors = {};
    if (!body.currentPassword) errors.currentPassword = 'กรุณากรอกรหัสผ่านเดิม';
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(body.newPassword)) errors.newPassword = 'อย่างน้อย 8 ตัว มีพิมพ์ใหญ่ พิมพ์เล็ก และตัวเลข';
    if ($('confirmPassword').value !== body.newPassword) errors.confirmPassword = 'รหัสผ่านไม่ตรงกัน';
    if (Object.keys(errors).length) return showErrors(form, errors);
    try {
      await api.post('/auth/password/change', body);
      form.reset();
      alertMsg('success', 'เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นถูกออกจากระบบทั้งหมด');
      loadSessions();
    } catch (err) {
      handleError(err, form);
    }
  }

  function deviceName(ua) {
    if (!ua) return 'ไม่ทราบอุปกรณ์';
    const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : ua.slice(0, 40);
    const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    return os ? `${browser} บน ${os}` : browser;
  }

  async function loadSessions() {
    const body = $('sessions');
    body.replaceChildren();
    const row = (text) => {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.className = 'muted';
      td.textContent = text;
      tr.appendChild(td);
      return tr;
    };
    try {
      const d = await api.get('/auth/sessions');
      if (!d.items.length) body.appendChild(row('ไม่มีข้อมูล'));
      d.items.forEach((s) => {
        const tr = document.createElement('tr');
        const cells = [
          `${deviceName(s.userAgent)}${s.isCurrent ? ' (เครื่องนี้)' : ''}`,
          s.ipAddress,
          new Date(s.lastSeenAt).toLocaleString('th-TH'),
        ].map((t) => { const td = document.createElement('td'); td.textContent = t; return td; });
        const act = document.createElement('td');
        if (!s.isCurrent) {
          const btn = document.createElement('button');
          btn.className = 'btn';
          btn.textContent = 'ออกจากระบบ';
          btn.onclick = async () => {
            try { await api.del(`/auth/sessions/${s.id}`); loadSessions(); } catch (err) { handleError(err); }
          };
          act.appendChild(btn);
        }
        tr.append(...cells, act);
        body.appendChild(tr);
      });
    } catch (err) {
      body.appendChild(row(err.status === 404 ? 'จะแสดงได้เมื่อระบบสมาชิกของ SA พร้อม' : err.message));
    }
  }

  // ---------------------------------------------------------------- addresses
  let editingId = null;

  function addressText(a) {
    return `${a.addressLine} ต.${a.subDistrict} อ.${a.district} จ.${a.province} ${a.postalCode}`;
  }

  function renderAddresses(items) {
    const list = $('addr-list');
    list.replaceChildren();
    if (!items.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'ยังไม่มีที่อยู่จัดส่ง กรุณาเพิ่มก่อนชำระเงิน';
      list.appendChild(p);
      return;
    }
    items.forEach((a) => {
      const card = document.createElement('div');
      card.className = 'card addr-card';
      const info = document.createElement('div');
      const who = document.createElement('div');
      who.className = 'who';
      who.textContent = `${a.recipientName} · ${fmtPhone(a.phone)}`;
      if (a.isDefault) {
        const b = document.createElement('span');
        b.className = 'badge badge-success';
        b.textContent = 'ค่าเริ่มต้น';
        who.appendChild(b);
      }
      const addr = document.createElement('div');
      addr.className = 'muted';
      addr.textContent = addressText(a);
      info.append(who, addr);

      const actions = document.createElement('div');
      actions.className = 'row-actions';
      const btn = (label, fn, cls = 'btn') => {
        const x = document.createElement('button');
        x.type = 'button';
        x.className = cls;
        x.textContent = label;
        x.onclick = fn;
        return x;
      };
      if (!a.isDefault) actions.appendChild(btn('ตั้งเป็นค่าเริ่มต้น', () => setDefault(a.id)));
      actions.appendChild(btn('แก้ไข', () => openAddressForm(a)));
      actions.appendChild(btn('ลบ', () => deleteAddress(a)));
      card.append(info, actions);
      list.appendChild(card);
    });
  }

  async function loadAddresses() {
    try {
      const d = await api.get('/users/me/addresses');
      renderAddresses(d.items);
    } catch (err) {
      handleError(err);
    }
  }

  function openAddressForm(a) {
    const form = $('addr-form');
    clearErrors(form);
    form.reset();
    editingId = a ? a.id : null;
    $('addr-form-title').textContent = a ? 'แก้ไขที่อยู่' : 'เพิ่มที่อยู่ใหม่';
    if (a) {
      $('recipientName').value = a.recipientName;
      $('addrPhone').value = a.phone;
      $('addressLine').value = a.addressLine;
      $('subDistrict').value = a.subDistrict;
      $('district').value = a.district;
      $('province').value = a.province;
      $('postalCode').value = a.postalCode;
    }
    $('addr-form-card').hidden = false;
    $('recipientName').focus();
  }

  async function saveAddress(e) {
    e.preventDefault();
    const form = e.target;
    clearErrors(form);
    const body = formData(form);
    body.phone = String(body.phone || '').replace(/[\s-]/g, '');
    const errors = {};
    if (!body.recipientName.trim()) errors.recipientName = 'กรุณากรอกชื่อผู้รับ';
    if (!/^0\d{9}$/.test(body.phone)) errors.phone = 'เบอร์โทรต้องเป็นตัวเลข 10 หลักขึ้นต้นด้วย 0';
    if (!body.addressLine.trim()) errors.addressLine = 'กรุณากรอกบ้านเลขที่ ถนน ซอย';
    if (!body.subDistrict.trim()) errors.subDistrict = 'กรุณากรอกตำบล / แขวง';
    if (!body.district.trim()) errors.district = 'กรุณากรอกอำเภอ / เขต';
    if (!body.province.trim()) errors.province = 'กรุณากรอกจังหวัด';
    if (!/^\d{5}$/.test(body.postalCode)) errors.postalCode = 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก';
    if (Object.keys(errors).length) return showErrors(form, errors);
    try {
      if (editingId) await api.put(`/users/me/addresses/${editingId}`, body);
      else await api.post('/users/me/addresses', body);
      $('addr-form-card').hidden = true;
      alertMsg('success', 'บันทึกที่อยู่แล้ว');
      loadAddresses();
    } catch (err) {
      handleError(err, form);
    }
  }

  async function setDefault(id) {
    try {
      await api.post(`/users/me/addresses/${id}/default`);
      loadAddresses();
    } catch (err) {
      handleError(err);
    }
  }

  async function deleteAddress(a) {
    if (!confirm(`ลบที่อยู่ของ ${a.recipientName}?`)) return;
    try {
      await api.del(`/users/me/addresses/${a.id}`);
      alertMsg('success', 'ลบที่อยู่แล้ว');
      loadAddresses();
    } catch (err) {
      handleError(err);
    }
  }

  // ---------------------------------------------------------------- notification settings
  const GROUPS = [
    { key: 'auction', label: 'การประมูล', events: 'ถูกเสนอราคาแซง, ใกล้หมดเวลา, ต่อเวลา, ชนะ/แพ้ประมูล, ผลอนุมัติสินค้า' },
    { key: 'finance', label: 'การเงิน', events: 'ถึงกำหนดชำระ, ชำระสำเร็จ, ได้รับเงินคืน, ได้รับเงินจากการขาย' },
    { key: 'shipping', label: 'การจัดส่ง', events: 'ผู้ขายส่งของแล้ว, ข้อพิพาท' },
  ];

  async function loadNotifSettings() {
    try {
      const s = await api.get('/users/me/notification-settings');
      const host = $('notif-groups');
      host.replaceChildren();
      GROUPS.forEach((g) => {
        const row = document.createElement('div');
        row.className = 'notif-group';
        const info = document.createElement('div');
        const t = document.createElement('strong');
        t.textContent = g.label;
        const d = document.createElement('div');
        d.className = 'hint';
        d.textContent = g.events;
        info.append(t, d);
        const toggle = (channel, label) => {
          const l = document.createElement('label');
          const c = document.createElement('input');
          c.type = 'checkbox';
          c.name = `${g.key}.${channel}`;
          c.checked = s[g.key][channel];
          l.append(c, document.createTextNode(label));
          return l;
        };
        row.append(info, toggle('web', 'ในเว็บ'), toggle('email', 'อีเมล'));
        host.appendChild(row);
      });
    } catch (err) {
      handleError(err);
    }
  }

  async function saveNotifSettings(e) {
    e.preventDefault();
    const body = {};
    GROUPS.forEach((g) => {
      body[g.key] = {
        web: e.target.querySelector(`[name="${g.key}.web"]`).checked,
        email: e.target.querySelector(`[name="${g.key}.email"]`).checked,
      };
    });
    try {
      await api.put('/users/me/notification-settings', body);
      alertMsg('success', 'บันทึกการตั้งค่าการแจ้งเตือนแล้ว');
    } catch (err) {
      handleError(err);
    }
  }

  // มาจากหน้าอื่น (?next=) เช่น หน้าชำระเงินกด "เพิ่มที่อยู่ใหม่" → มีลิงก์กลับ (รับเฉพาะ path ในเว็บนี้)
  function renderBackLink() {
    const next = new URLSearchParams(location.search).get('next') || '';
    if (!/^\/(?![\/\\])/.test(next)) return;
    const a = $('back-link');
    a.href = next;
    a.textContent = next.startsWith('/pages/payment.html') ? '← กลับไปหน้าชำระเงิน' : '← กลับไปหน้าก่อนหน้า';
    a.hidden = false;
  }

  // ---------------------------------------------------------------- init
  document.addEventListener('user:ready', (e) => {
    me = e.detail;
    if (!me) { location.href = '/pages/login.html?next=' + encodeURIComponent(location.pathname); return; }
    if (!isMember(me)) document.querySelectorAll('[data-member]').forEach((b) => b.remove());

    renderProfile();
    renderBackLink();
    $('tabs').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-tab]');
      if (b) openTab(b.dataset.tab);
    });
    $('profile-form').addEventListener('submit', saveProfile);
    $('avatar-input').addEventListener('change', uploadAvatar);
    $('avatar-remove').addEventListener('click', removeAvatar);
    $('password-form').addEventListener('submit', changePassword);
    $('addr-add').addEventListener('click', () => openAddressForm(null));
    $('addr-cancel').addEventListener('click', () => { $('addr-form-card').hidden = true; });
    $('addr-form').addEventListener('submit', saveAddress);
    $('notif-form').addEventListener('submit', saveNotifSettings);

    const initial = location.hash.slice(1);
    if (document.querySelector(`#tabs button[data-tab="${initial}"]`)) openTab(initial);
  });
})();

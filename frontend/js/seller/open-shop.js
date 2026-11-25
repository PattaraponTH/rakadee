// pages/seller/open-shop.js — ยื่นขอเปิดร้าน (api-spec 3.1, 3.2, D-18) เจ้าของ: QA
// สถานะหน้า: ยังไม่เคยยื่น → ฟอร์ม | pending → รอแอดมินตรวจ | rejected → เหตุผล + ยื่นใหม่ | seller → ไปร้านของฉัน
'use strict';

const PROVINCES = [
  'กรุงเทพมหานคร', 'กระบี่', 'กาญจนบุรี', 'กาฬสินธุ์', 'กำแพงเพชร', 'ขอนแก่น',
  'จันทบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ชัยนาท', 'ชัยภูมิ', 'ชุมพร', 'เชียงราย', 'เชียงใหม่',
  'ตรัง', 'ตราด', 'ตาก', 'นครนายก', 'นครปฐม', 'นครพนม', 'นครราชสีมา', 'นครศรีธรรมราช',
  'นครสวรรค์', 'นนทบุรี', 'นราธิวาส', 'น่าน', 'บึงกาฬ', 'บุรีรัมย์', 'ปทุมธานี',
  'ประจวบคีรีขันธ์', 'ปราจีนบุรี', 'ปัตตานี', 'พระนครศรีอยุธยา', 'พะเยา', 'พังงา',
  'พัทลุง', 'พิจิตร', 'พิษณุโลก', 'เพชรบุรี', 'เพชรบูรณ์', 'แพร่', 'ภูเก็ต', 'มหาสารคาม',
  'มุกดาหาร', 'แม่ฮ่องสอน', 'ยโสธร', 'ยะลา', 'ร้อยเอ็ด', 'ระนอง', 'ระยอง', 'ราชบุรี',
  'ลพบุรี', 'ลำปาง', 'ลำพูน', 'เลย', 'ศรีสะเกษ', 'สกลนคร', 'สงขลา', 'สตูล',
  'สมุทรปราการ', 'สมุทรสงคราม', 'สมุทรสาคร', 'สระแก้ว', 'สระบุรี', 'สิงห์บุรี',
  'สุโขทัย', 'สุพรรณบุรี', 'สุราษฎร์ธานี', 'สุรินทร์', 'หนองคาย', 'หนองบัวลำภู',
  'อ่างทอง', 'อำนาจเจริญ', 'อุดรธานี', 'อุตรดิตถ์', 'อุทัยธานี', 'อุบลราชธานี',
];

const $ = (id) => document.getElementById(id);
const { el } = qa;
let currentUser = null;
let profile = null;

function addressText(a) {
  return `${a.recipientName} · ${a.addressLine} ${a.subDistrict} ${a.district} ${a.province} ${a.postalCode}`;
}

function fillSelect(sel, items, toOption) {
  const first = sel.options[0];
  sel.replaceChildren(first, ...items.map(toOption));
}

async function loadAddresses() {
  const sel = $('addressId');
  try {
    const data = await api.get('/users/me/addresses');
    const items = data.items || data || [];
    fillSelect(sel, items, (a) => el('option', { value: a.id, text: addressText(a) + (a.isDefault ? ' (ค่าเริ่มต้น)' : '') }));
    if (!items.length) {
      $('address-hint').replaceChildren('ยังไม่มีที่อยู่ในสมุดที่อยู่ ',
        // ?next= ให้หน้าตั้งค่ามีลิงก์กลับมาหน้าเปิดร้าน (แบบเดียวกับหน้าชำระเงิน)
        el('a', { href: `/pages/settings.html?next=${encodeURIComponent(location.pathname)}#addresses`, text: 'เพิ่มที่อยู่ก่อน' }));
    } else if (!sel.value) {
      const def = items.find((a) => a.isDefault);
      if (def) sel.value = def.id;
    }
  } catch (err) {
    qa.alertBox($('alert-area'), err.message);
  }
}

// ต้องยืนยันอีเมลก่อนยื่น (D-18) — แสดงกล่องเตือนพร้อมปุ่มส่งลิงก์ใหม่
function renderEmailBox() {
  const box = $('email-box');
  const verified = currentUser && currentUser.emailVerified;
  $('btn-submit').disabled = !verified;
  if (verified) { box.replaceChildren(); return; }
  const resend = el('button', { type: 'button', class: 'btn', text: 'ส่งลิงก์ยืนยันอีเมลอีกครั้ง' });
  resend.addEventListener('click', async () => {
    resend.disabled = true;
    try {
      await api.post('/auth/email/resend');
      qa.alertBox($('alert-area'), `ส่งลิงก์ยืนยันไปที่ ${currentUser.email} แล้ว`, 'success');
    } catch (err) {
      qa.alertBox($('alert-area'), err.message);
      resend.disabled = false;
    }
  });
  box.replaceChildren(el('div', { class: 'alert alert-error' },
    el('div', { text: 'ต้องยืนยันอีเมลก่อนยื่นขอเปิดร้าน กดลิงก์ในอีเมลแล้วกลับมาหน้านี้อีกครั้ง' }),
    el('div', { style: 'margin-top:8px;' }, resend)));
}

function showForm(prefill) {
  $('state-box').hidden = true;
  $('form-open-shop').hidden = false;
  if (prefill) {
    $('shopName').value = prefill.shopName || '';
    $('shopDescription').value = prefill.shopDescription || '';
    $('originProvince').value = prefill.originProvince || '';
    if (prefill.address) $('addressId').value = prefill.address.id;
    $('btn-submit').textContent = 'ยื่นคำขอใหม่';
    $('btn-cancel-edit').hidden = false;
  }
  renderEmailBox();
}

function showState(kind) {
  const box = $('state-box');
  $('form-open-shop').hidden = true;
  box.hidden = false;
  box.className = 'card qa-state';

  if (kind === 'seller') {
    box.classList.add('is-success');
    box.replaceChildren(
      el('div', { class: 'icon', text: '✓' }),
      el('h2', { text: 'คุณเป็นผู้ขายแล้ว' }),
      el('p', { class: 'muted', text: 'ลงสินค้าประมูลและจัดการร้านได้จากเมนูร้านของฉัน' }),
      el('div', { class: 'row-actions', style: 'justify-content:center;' },
        el('a', { class: 'btn btn-primary', href: '/pages/seller/listings.html', text: 'ไปที่สินค้าของฉัน' }),
        el('a', { class: 'btn btn-accent', href: '/pages/seller/listing-form.html', text: '+ ลงสินค้าใหม่' })),
    );
    return;
  }

  if (kind === 'admin') {
    box.replaceChildren(el('h2', { text: 'บัญชีแอดมินเปิดร้านไม่ได้' }),
      el('p', { class: 'muted', text: 'แอดมินลงสินค้าและบิดไม่ได้ตามนโยบายระบบ' }));
    return;
  }

  const summary = el('dl', { class: 'qa-kv', style: 'max-width:480px;margin:16px auto 0;text-align:left;' },
    el('dt', { text: 'ชื่อร้าน' }), el('dd', { text: profile.shopName }),
    el('dt', { text: 'จังหวัดต้นทาง' }), el('dd', { text: profile.originProvince }),
    el('dt', { text: 'ที่อยู่ส่งของ' }), el('dd', { text: profile.address ? addressText(profile.address) : '-' }),
    el('dt', { text: 'ยื่นเมื่อ' }), el('dd', { text: qa.dateTime(profile.submittedAt) }));

  if (kind === 'pending') {
    box.replaceChildren(
      el('div', { class: 'icon', text: '⏳' }),
      el('h2', { text: 'รอแอดมินตรวจสอบ' }),
      el('p', { class: 'muted', text: 'เราจะแจ้งผลทางการแจ้งเตือนและอีเมล ระหว่างนี้ยังลงสินค้าไม่ได้ แต่บิดสินค้าได้ตามปกติ' }),
      summary,
    );
    return;
  }

  // rejected
  box.classList.add('is-danger');
  const retry = el('button', { type: 'button', class: 'btn btn-accent', text: 'แก้ไขข้อมูลและยื่นใหม่' });
  retry.addEventListener('click', () => showForm(profile));
  box.replaceChildren(
    el('div', { class: 'icon', text: '!' }),
    el('h2', { text: 'คำขอเปิดร้านไม่ผ่านการอนุมัติ' }),
    el('div', { class: 'qa-reason' }, el('strong', { text: 'เหตุผล: ' }), profile.rejectReason || '-'),
    el('p', { class: 'muted', style: 'margin-top:12px;', text: `ตรวจเมื่อ ${qa.dateTime(profile.reviewedAt)}` }),
    el('div', { class: 'row-actions', style: 'justify-content:center;margin-top:8px;' }, retry),
  );
}

function render() {
  if (currentUser.role === 'admin' || currentUser.role === 'super_admin') return showState('admin');
  if (currentUser.role === 'seller') return showState('seller');
  if (!profile) return showForm();
  if (profile.status === 'pending') return showState('pending');
  if (profile.status === 'rejected') return showState('rejected');
  return showState('seller');
}

function validate(data) {
  const errors = {};
  if (!data.shopName) errors.shopName = 'กรุณากรอกชื่อร้าน';
  else if (data.shopName.length > 100) errors.shopName = 'ชื่อร้านต้องไม่เกิน 100 ตัวอักษร';
  if (!data.originProvince) errors.originProvince = 'กรุณาเลือกจังหวัดต้นทาง';
  if (!data.addressId) errors.addressId = 'กรุณาเลือกที่อยู่ส่งของ/รับคืน';
  if (!$('acceptFee').checked) errors.acceptFee = 'กรุณายอมรับเงื่อนไขค่าธรรมเนียม';
  qa.fieldErrors(errors);
  return Object.keys(errors).length === 0;
}

async function onSubmit(e) {
  e.preventDefault();
  qa.clearFieldErrors();
  qa.alertBox($('alert-area'), '');
  const data = {
    shopName: $('shopName').value.trim(),
    shopDescription: $('shopDescription').value.trim(),
    originProvince: $('originProvince').value,
    addressId: Number($('addressId').value) || null,
  };
  if (!validate(data)) return;

  const btn = $('btn-submit');
  btn.disabled = true;
  try {
    profile = await api.post('/seller/profile', data);
    qa.alertBox($('alert-area'), 'ยื่นคำขอเปิดร้านแล้ว รอแอดมินตรวจสอบ', 'success');
    render();
  } catch (err) {
    if (err.code === 'ADDRESS_REQUIRED') qa.fieldErrors({ addressId: err.message });
    else if (err.code === 'VALIDATION_ERROR' && qa.fieldErrors(err.details)) { /* แสดงที่ช่องแล้ว */ }
    else qa.alertBox($('alert-area'), err.message);
    if (['APPLICATION_PENDING', 'ALREADY_SELLER'].includes(err.code)) {
      profile = await api.get('/seller/profile').catch(() => profile);
      render();
    }
  } finally {
    btn.disabled = !(currentUser && currentUser.emailVerified);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  fillSelect($('originProvince'), PROVINCES, (p) => el('option', { value: p, text: p }));
  $('form-open-shop').addEventListener('submit', onSubmit);
  $('btn-cancel-edit').addEventListener('click', () => render());
});

document.addEventListener('user:ready', async (e) => {
  currentUser = e.detail;
  if (!currentUser) { location.href = `/pages/login.html?next=${encodeURIComponent(location.pathname)}`; return; }
  if (currentUser.role === 'bidder' || currentUser.role === 'seller') {
    try {
      [profile] = await Promise.all([api.get('/seller/profile'), loadAddresses()]);
    } catch (err) {
      qa.alertBox($('alert-area'), err.message);
    }
  }
  render();
});

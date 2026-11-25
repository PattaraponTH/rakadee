// หน้ารายละเอียดสินค้า (ข้อ 3.5, 4): รูป ข้อมูลทั้งหมด ราคาปัจจุบันแบบสด countdown ปุ่มบิด ตั้ง Proxy ปุ่ม Buy Now พร้อมกล่องยืนยัน
// ประวัติการบิดแบบปิดบังชื่อ (a***3) Guest เห็นแต่กดไม่ได้
// API: GET /api/listings/:id (5.2), GET /api/listings/:id/bids (5.3), POST .../bids (6.1), PUT .../proxy (6.3),
//      POST .../buy-now (6.5), POST/DELETE /api/watchlist (5.6/5.7)
// Socket (api-spec 12): ใช้ window.getSocket() ของ layout.js แล้ว join ห้อง listing:<id>
(function () {
  'use strict';
  const A = window.Auction;
  const { h } = A;

  const listingId = new URLSearchParams(location.search).get('id');
  const root = document.getElementById('listing-root');
  const HISTORY_LIMIT = 20;

  // ---------- สถานะของหน้า (เงินเป็นสตางค์ เวลาเป็น ms) ----------
  let item = null;
  let viewer = null;
  let user = null; // ผู้ใช้ที่ login (ใช้คำนวณ viewer ใหม่ตอนโหลดข้อมูลซ้ำ)
  let closed = false;
  const el = {};

  // ListingDetail -> รูปแบบที่หน้าใช้
  function normalizeDetail(d) {
    return {
      id: d.id,
      title: d.title,
      description: d.description,
      includedItems: d.includedItems,
      itemCondition: d.itemCondition,
      conditionName: A.CONDITION_NAMES[d.itemCondition] || d.itemCondition,
      defectDetail: d.defectDetail,
      category: d.category,
      images: d.images || [],
      shippingFee: A.moneyToSatang(d.shippingFee),
      originProvince: d.originProvince,
      startPrice: A.moneyToSatang(d.startPrice),
      bidIncrement: A.moneyToSatang(d.bidIncrement),
      currentPrice: A.moneyToSatang(d.currentPrice),
      minNextBid: A.moneyToSatang(d.minNextBid),
      buyNowPrice: A.moneyToSatang(d.buyNowPrice),
      buyNowAvailable: d.buyNowAvailable,
      reserveMet: d.reserveMet,
      bidCount: d.bidCount,
      status: d.status,
      result: d.result,
      endAt: A.toMs(d.endAt),
      extendCount: d.extendCount,
      maxExtendCount: d.maxExtendCount,
      seller: d.seller,
      me: d.me,
    };
  }

  // มุมมองของผู้ดู ใช้กฎข้อ 2 เดียวกับ decideBid(): แอดมิน/เจ้าของบิดไม่ได้, บัญชีต้อง active หรือ restricted (D-03)
  // ที่ FE แค่ซ่อนปุ่ม BE ตรวจซ้ำทุกครั้ง · วงเงิน Proxy มาจาก me.proxy ที่ API ส่งให้เจ้าของเท่านั้น
  const BLOCKED_STATUS_TEXT = {
    pending_verification: 'กรุณายืนยันเบอร์โทรศัพท์ก่อนบิด',
    suspended: 'บัญชีถูกระงับชั่วคราว จึงบิดไม่ได้',
    banned: 'บัญชีถูกระงับถาวร จึงบิดไม่ได้',
  };
  function getViewer(user) {
    const me = item.me;
    if (!user || !me) return { kind: 'guest', isLeader: false, myMax: null };
    if (['admin', 'super_admin'].includes(user.role)) return { kind: 'admin', isLeader: false, myMax: null };
    if (me.isOwner) return { kind: 'owner', isLeader: false, myMax: null };
    if (user.status !== 'active' && user.status !== 'restricted') {
      return { kind: 'blocked', isLeader: false, myMax: null, blockText: BLOCKED_STATUS_TEXT[user.status] || 'สถานะบัญชีไม่สามารถบิดได้' };
    }
    const proxy = me.proxy && me.proxy.isActive ? A.moneyToSatang(me.proxy.maxAmount) : null;
    return { kind: 'bidder', isLeader: Boolean(me.isLeading), myMax: me.isLeading ? proxy : null };
  }

  function minNext() {
    return item.minNextBid != null ? item.minNextBid : A.minNextBid(item);
  }
  const bahtInput = (satang) => (satang / 100).toFixed(2).replace(/\.00$/, '');

  // ---------- สร้างหน้า ----------
  function buildGallery() {
    const imgs = item.images.map((i) => ({ ...i, url: A.safeImageUrl(i.url) })).filter((i) => i.url);
    if (!imgs.length) {
      return h('div', null, h('div', { class: 'au-gallery-main', role: 'img', 'aria-label': 'ยังไม่มีรูปสินค้า' }));
    }
    const main = h('img', { class: 'au-gallery-main', src: imgs[0].url, alt: item.title });
    const thumbs = imgs.map((img, i) => {
      const t = h('button', { type: 'button', class: 'au-thumb', 'aria-label': `รูปที่ ${i + 1}`, 'aria-pressed': i === 0 ? 'true' : 'false' },
        h('img', { src: img.url, alt: '' }));
      t.addEventListener('click', () => {
        thumbs.forEach((x) => x.setAttribute('aria-pressed', x === t ? 'true' : 'false'));
        main.src = img.url;
      });
      return t;
    });
    return h('div', null, main, imgs.length > 1 ? h('div', { class: 'au-thumbs' }, thumbs) : null);
  }

  function buildCountdown() {
    const cell = (key, unit) => {
      const value = h('strong', { text: '00' });
      el[key] = value;
      return h('div', { class: 'au-cd-cell' }, value, h('span', { text: unit }));
    };
    el.countdown = h('div', { class: 'au-countdown', role: 'timer', 'aria-label': 'เวลาที่เหลือ' },
      cell('cdD', 'วัน'), cell('cdH', 'ชม.'), cell('cdM', 'นาที'), cell('cdS', 'วินาที'));
    return el.countdown;
  }

  function buildBidBox() {
    el.priceLabel = h('div', { class: 'au-label' });
    el.price = h('div', { class: 'au-price-big' });
    el.summary = h('div', null);
    el.extend = h('div', { class: 'au-extend-note' });
    return h('div', { class: 'au-box' }, el.priceLabel, el.price, el.summary, buildCountdown(), el.extend, buildActions());
  }

  function buildActions() {
    const wrap = h('div', { id: 'actions' });
    el.actions = wrap;
    el.msg = h('div', { id: 'bid-msg', 'aria-live': 'polite' });

    const LOCK_TEXT = {
      owner: 'นี่คือสินค้าของคุณ ไม่สามารถบิดหรือซื้อทันทีได้',
      admin: 'บัญชีแอดมินไม่สามารถบิดได้',
      blocked: viewer.blockText,
    };
    if (LOCK_TEXT[viewer.kind]) {
      wrap.append(h('div', { class: 'au-lock', text: LOCK_TEXT[viewer.kind] }), el.msg);
      return wrap;
    }
    if (viewer.kind === 'guest') {
      wrap.append(
        h('div', { class: 'au-actions-disabled' },
          h('div', { class: 'form-group' },
            el.guestLabel = h('label', { for: 'bid-amount' }),
            el.guestInput = h('input', { id: 'bid-amount', disabled: true })),
          h('div', { class: 'au-bid-actions' },
            h('button', { type: 'button', class: 'btn btn-primary', disabled: true, text: 'บิดทันที' }),
            h('button', { type: 'button', class: 'btn', disabled: true, text: 'ตั้ง Proxy Bid' })),
          el.guestBuy = item.buyNowPrice != null
            ? h('button', { type: 'button', class: 'btn au-buynow', disabled: true, text: `ซื้อทันที ${A.formatMoney(item.buyNowPrice)}` })
            : null),
        h('div', { class: 'au-lock' },
          h('span', null, 'เข้าสู่ระบบเพื่อประมูล — คุณยังไม่สามารถบิดหรือซื้อทันทีได้ '),
          h('a', { href: '/pages/login.html', text: 'เข้าสู่ระบบ' })),
        el.msg);
      return wrap;
    }

    // bidder
    el.input = h('input', { id: 'bid-amount', name: 'amount', inputmode: 'decimal', autocomplete: 'off', value: bahtInput(minNext()) });
    el.hint = h('p', { class: 'au-hint' });
    el.bidBtn = h('button', { type: 'submit', class: 'btn btn-primary', text: 'บิดทันที' });
    el.proxyBtn = h('button', { type: 'button', class: 'btn', text: 'ตั้ง Proxy Bid' });
    el.buyBtn = item.buyNowPrice != null
      ? h('button', { type: 'button', class: 'btn au-buynow', text: `ซื้อทันที ${A.formatMoney(item.buyNowPrice)}` })
      : null;
    el.label = h('label', { for: 'bid-amount' });

    const form = h('form', { novalidate: true },
      h('div', { class: 'form-group' }, el.label, el.input, el.hint),
      h('div', { class: 'au-bid-actions' }, el.bidBtn, el.proxyBtn),
      el.buyBtn);
    form.addEventListener('submit', (e) => { e.preventDefault(); handleBid('manual'); });
    el.proxyBtn.addEventListener('click', () => handleBid('proxy'));
    if (el.buyBtn) el.buyBtn.addEventListener('click', openBuyNow);
    wrap.append(form, el.msg, buildProxyBox());
    return wrap;
  }

  // กล่อง Proxy ของฉัน (เป็นความลับ เห็นเฉพาะเจ้าของ) D-13: เพิ่มวงเงินได้อย่างเดียว ลดหรือยกเลิกไม่ได้
  function buildProxyBox() {
    el.proxyText = h('div');
    el.proxyBox = h('div', { class: 'au-proxy-box' },
      h('header', null, h('span', { text: 'Proxy Bid ของคุณ (เป็นความลับ)' })),
      el.proxyText,
      h('div', { class: 'au-hint', text: 'เพิ่มวงเงินได้อย่างเดียว ลดหรือยกเลิกไม่ได้' }));
    return el.proxyBox;
  }

  function buildSellerCard() {
    const s = item.seller;
    const name = s.shopName || s.displayName || 'ร้านค้า';
    return h('div', { class: 'au-box au-seller-card' },
      h('div', { class: 'au-avatar', 'aria-hidden': 'true', text: Array.from(name.replace(/^ร้าน/, ''))[0] || '?' }),
      h('div', { class: 'au-grow' },
        h('strong', { text: name }),
        h('div', { class: 'au-label', text: `จังหวัดต้นทาง: ${item.originProvince || '-'} · ค่าจัดส่ง ${item.shippingFee ? A.formatMoney(item.shippingFee) : 'ส่งฟรี'}` })),
      h('a', { href: A.sellerUrl(s.id), text: 'ดูโปรไฟล์ร้าน' }));
  }

  // D-16: ประวัติสาธารณะแสดงแถว proxy เป็น "auto" ชื่อปิดบังแบบ a***3 ส่วนของตัวเองมี (คุณ)
  const fmtTime = (ms) => new Date(ms).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  function historyRow(b) {
    let who = b.bidder || '***';
    if (b.bidType === 'auto') who += ' (auto)';
    if (b.bidType === 'buy_now') who += ' (ซื้อทันที)';
    if (b.isMe) who += ' (คุณ)';
    return h('tr', null, h('td', { text: who }), h('td', { text: A.formatMoney(A.moneyToSatang(b.amount)) }), h('td', { text: fmtTime(A.toMs(b.createdAt)) }));
  }

  async function loadHistory() {
    try {
      const data = await api.get(`/listings/${encodeURIComponent(listingId)}/bids?limit=${HISTORY_LIMIT}`);
      el.historyBody.replaceChildren(...(data.items.length ? data.items.map(historyRow)
        : [h('tr', null, h('td', { colspan: '3', class: 'muted', text: 'ยังไม่มีการบิด' }))]));
    } catch (e) {
      el.historyBody.replaceChildren(h('tr', null, h('td', { colspan: '3', text: e.message })));
    }
  }

  function buildInfo() {
    const dl = h('dl', null,
      h('dt', { text: 'รายละเอียดสินค้า' }), h('dd', { text: item.description }),
      item.includedItems && [h('dt', { text: 'สิ่งที่ได้รับ' }), h('dd', { text: item.includedItems })],
      item.defectDetail && [h('dt', { text: 'ตำหนิ' }), h('dd', { text: item.defectDetail })]);
    const history = h('div', { class: 'au-table-wrap' },
      h('table', null,
        h('thead', null, h('tr', null, h('th', { text: 'ผู้บิด' }), h('th', { text: 'ราคา' }), h('th', { text: 'เวลา' }))),
        (el.historyBody = h('tbody', null, h('tr', null, h('td', { colspan: '3', class: 'muted', text: 'กำลังโหลด...' }))))));
    return h('div', { class: 'au-info-grid' },
      h('section', { class: 'au-box' }, h('h2', { text: 'รายละเอียดสินค้า' }), dl),
      h('section', null, h('h2', { text: 'ประวัติการบิด' }), history));
  }

  function buildWatchButton() {
    if (!item.me || item.me.isOwner) return null;
    const btn = h('button', { type: 'button', class: 'btn au-watch-btn', 'aria-pressed': item.me.inWatchlist ? 'true' : 'false' });
    const paint = (on) => { btn.setAttribute('aria-pressed', String(on)); btn.textContent = on ? '♥ อยู่ใน Watchlist' : '♡ เพิ่มใน Watchlist'; };
    paint(item.me.inWatchlist);
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        paint(await A.setWatch(item.id, btn.getAttribute('aria-pressed') !== 'true'));
      } catch (e) {
        A.flash(e.message);
      } finally {
        btn.disabled = false;
      }
    });
    return btn;
  }

  function build() {
    document.title = `${item.title} - RAKADEE`;
    const cat = item.category || {};
    document.getElementById('crumb-category').textContent = cat.parent ? `${cat.parent.name} › ${cat.name}` : (cat.name || 'รายการประมูล');
    document.getElementById('crumb-title').textContent = item.title;

    el.leaderBadge = viewer.kind === 'bidder' ? h('span', { class: 'badge badge-warning', text: 'คุณเป็นผู้นำ' }) : null;
    el.statusBadge = h('span', { class: 'badge badge-success', text: 'กำลังประมูล' });
    const right = h('div', null,
      h('div', { class: 'au-badges' }, h('span', { class: 'badge', text: item.conditionName }), el.statusBadge, el.leaderBadge),
      h('h1', { text: item.title }),
      buildWatchButton(),
      buildBidBox(),
      buildSellerCard());
    root.replaceChildren(h('div', { class: 'au-detail' }, buildGallery(), right), buildInfo());
    paintAll();
    if (item.status !== 'active') markClosed(closedText(item.result, item.currentPrice));
  }

  // ---------- วาดค่าที่เปลี่ยนได้ ----------
  function paintAll() {
    el.priceLabel.textContent = item.currentPrice == null ? 'ราคาเริ่มต้น (ยังไม่มีผู้บิด)' : 'ราคาปัจจุบัน';
    el.price.textContent = A.formatMoney(item.currentPrice != null ? item.currentPrice : item.startPrice);
    el.summary.textContent = `ราคาเริ่มต้น ${A.formatMoney(item.startPrice)} · ${item.bidCount} การบิด · บิดขั้นต่ำ ${A.formatMoney(item.bidIncrement)}`;
    el.extend.hidden = !(item.extendCount > 0);
    el.extend.textContent = `ต่อเวลาอัตโนมัติแล้ว ${item.extendCount}/${item.maxExtendCount} ครั้ง`;
    if (el.leaderBadge) el.leaderBadge.hidden = !viewer.isLeader;
    if (el.proxyBox) {
      el.proxyBox.hidden = !(viewer.isLeader && viewer.myMax != null);
      if (viewer.myMax != null) el.proxyText.textContent = `วงเงินสูงสุด ${A.formatMoney(viewer.myMax)} — ระบบจะบิดแทนทีละขั้นต่ำเท่าที่จำเป็น`;
    }
    if (el.hint) {
      el.label.textContent = viewer.isLeader ? 'วงเงิน Proxy ใหม่ (ต้องสูงกว่าวงเงินเดิม)' : `ราคาที่เสนอ (ขั้นต่ำ ${A.formatMoney(minNext())})`;
      el.hint.textContent = viewer.isLeader ? 'คุณเป็นผู้นำอยู่แล้ว เพิ่มวงเงินได้ด้วย Proxy Bid' : `ราคาต้องไม่ต่ำกว่า ${A.formatMoney(minNext())}`;
    }
    if (el.buyBtn) el.buyBtn.hidden = !A.isBuyNowAvailable(item); // D-15
    // QA RT-4: ฟอร์มของ Guest (กดไม่ได้) แสดงขั้นต่ำล่าสุด และซ่อนซื้อทันทีตาม D-15 เหมือนผู้ซื้อ
    if (el.guestLabel) {
      el.guestLabel.textContent = `ราคาที่เสนอ (ขั้นต่ำ ${A.formatMoney(minNext())})`;
      el.guestInput.value = bahtInput(minNext());
    }
    if (el.guestBuy) el.guestBuy.hidden = !A.isBuyNowAvailable(item);
  }

  function paintCountdown() {
    // QA RT-3: ปิดแล้ว (หมดเวลา / ซื้อทันที / ผลจาก server) countdown หยุดที่ 00 ไม่นับต่อจาก end_at เดิม
    const remaining = item.status === 'active' ? item.endAt - A.clock.now() : 0;
    const t = A.splitRemaining(remaining);
    const two = (n) => String(n).padStart(2, '0');
    el.cdD.textContent = two(t.days);
    el.cdH.textContent = two(t.hours);
    el.cdM.textContent = two(t.minutes);
    el.cdS.textContent = two(t.seconds);
    if (remaining <= 0 && !closed && item.status === 'active') markClosed('หมดเวลาประมูลแล้ว กำลังสรุปผล');
  }

  function markClosed(message) {
    closed = true;
    el.countdown.classList.add('closed');
    el.statusBadge.textContent = 'ปิดประมูลแล้ว';
    el.statusBadge.className = 'badge';
    el.extend.hidden = true;
    root.querySelectorAll('#actions input, #actions button').forEach((x) => { x.disabled = true; });
    A.showAlert(el.msg, 'error', message);
  }

  // ผลการปิดประมูล (schema.sql listings.result)
  function closedText(result, priceSatang) {
    const price = priceSatang != null ? A.formatMoney(priceSatang) : '-';
    return {
      has_winner: `การประมูลปิดแล้ว ราคาปิด ${price}`,
      buy_now: `สินค้านี้ถูกซื้อทันทีแล้ว ราคา ${price}`,
      below_reserve: 'การประมูลปิดแล้ว ราคาไม่ถึงราคาขั้นต่ำที่ผู้ขายกำหนด',
      no_bid: 'การประมูลปิดแล้ว ไม่มีผู้เสนอราคา',
    }[result] || 'การประมูลปิดแล้ว';
  }

  // ---------- การบิด ----------
  const setMessage = (kind, text) => A.showAlert(el.msg, kind, text);

  async function handleBid(mode) {
    if (closed) return;
    const check = A.validateBidInput({
      mode, amountText: el.input.value, minNext: minNext(), isLeader: viewer.isLeader, leaderMax: viewer.myMax,
    });
    if (!check.ok) { setMessage('error', check.error); el.input.focus(); return; }
    // D-17: ราคาสูงผิดปกติ (>= 2 เท่าของราคาปัจจุบัน) ต้องกดยืนยันก่อนส่ง
    // Proxy ยืนยันทุกครั้ง: วงเงินผูกพันและลดหรือยกเลิกไม่ได้ (ข้อ 2.1, D-13) กันกดตั้งด้วยราคาขั้นต่ำที่เติมไว้โดยไม่ตั้งใจ
    const big = A.needsBidConfirm({ amountSatang: check.satang, currentPrice: item.currentPrice, startPrice: item.startPrice });
    if ((big || mode === 'proxy') && !(await confirmBigBid(mode, check.satang))) {
      el.input.focus();
      return;
    }
    el.bidBtn.disabled = el.proxyBtn.disabled = true;
    try {
      const amount = A.satangToBaht(check.satang);
      const res = mode === 'proxy'
        ? await api.put(`/listings/${encodeURIComponent(listingId)}/proxy`, { maxAmount: amount })
        : await api.post(`/listings/${encodeURIComponent(listingId)}/bids`, { amount });
      applyOwnResult(res, mode);
      const what = mode === 'proxy' ? `ตั้งวงเงิน Proxy ${A.formatMoney(check.satang)}` : `บิด ${A.formatMoney(check.satang)}`;
      setMessage(res.isLeading ? 'success' : 'error', res.isLeading ? `${what} สำเร็จ คุณเป็นผู้นำ` : `${what} แล้ว แต่มีผู้ตั้ง Proxy สูงกว่า ราคาตอนนี้ ${A.formatMoney(A.moneyToSatang(res.currentPrice))}`);
      loadHistory();
    } catch (e) {
      setMessage('error', e.message); // ApiError.message จาก BE (เช่น BID_TOO_LOW)
      if (e.details && e.details.minNextBid) { item.minNextBid = A.parseBahtToSatang(String(e.details.minNextBid)); paintAll(); }
    } finally {
      if (!closed) el.bidBtn.disabled = el.proxyBtn.disabled = false;
    }
  }

  // ผลจาก 6.1 / 6.3 ของตัวเอง (วงเงินในผลลัพธ์เป็นของเราเอง)
  function applyOwnResult(res, mode) {
    if (res.serverTime) A.clock.sync(res.serverTime);
    item.currentPrice = A.moneyToSatang(res.currentPrice);
    item.minNextBid = A.moneyToSatang(res.minNextBid);
    item.bidCount = res.bidCount;
    item.endAt = A.toMs(res.endAt);
    if (Number.isInteger(res.extendCount)) item.extendCount = res.extendCount;
    viewer.isLeader = Boolean(res.isLeading);
    if (mode === 'proxy') viewer.myMax = res.isLeading && res.isActive ? A.moneyToSatang(res.maxAmount) : null;
    if (!viewer.isLeader) viewer.myMax = null;
    paintAll();
    if (document.activeElement !== el.input) el.input.value = bahtInput(minNext());
  }

  // D-17 กล่องยืนยันราคาสูงผิดปกติ: ตัวเลขตัวใหญ่ + ราคาปัจจุบัน + ส่วนต่าง คืน true เมื่อกดยืนยัน
  function confirmBigBid(mode, satang) {
    const dialog = document.getElementById('bigbid-dialog');
    const base = item.currentPrice == null ? item.startPrice : item.currentPrice;
    document.getElementById('bigbid-title').textContent = mode === 'proxy' ? 'ยืนยันวงเงิน Proxy' : 'ยืนยันราคาที่เสนอ';
    document.getElementById('bigbid-amount').textContent = A.formatMoney(satang);
    document.getElementById('bigbid-base-label').textContent = item.currentPrice == null ? 'ราคาเริ่มต้น' : 'ราคาปัจจุบัน';
    document.getElementById('bigbid-base').textContent = A.formatMoney(base);
    document.getElementById('bigbid-diff').textContent = `+${A.formatMoney(satang - base)}`;
    document.getElementById('bigbid-note').textContent = mode === 'proxy'
      ? 'ระบบบิดแทนทีละขั้นเท่าที่จำเป็น ไม่ได้บิดเต็มวงเงินทันที แต่ถ้ามีผู้แข่งขัน ราคาอาจขึ้นไปถึงวงเงินนี้ได้ และลดหรือยกเลิกวงเงินไม่ได้'
      : `ราคานี้สูงกว่า${item.currentPrice == null ? 'ราคาเริ่มต้น' : 'ราคาปัจจุบัน'}ตั้งแต่ ${A.BID_CONFIRM_MULTIPLIER} เท่าขึ้นไป ตรวจจำนวนศูนย์ให้ถูกต้อง การบิดเป็นข้อผูกพันและยกเลิกไม่ได้`;
    return new Promise((resolve) => {
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
      dialog.returnValue = '';
      dialog.showModal();
    });
  }

  function openBuyNow() {
    if (closed) return;
    document.getElementById('buynow-text').textContent =
      `ยืนยันซื้อทันทีในราคา ${A.formatMoney(item.buyNowPrice)} (ค่าจัดส่ง ${A.formatMoney(item.shippingFee || 0)})? การซื้อทันทีจะปิดการประมูลของสินค้านี้ทันทีและยกเลิกไม่ได้ ต้องชำระเงินภายในเวลาที่กำหนด`;
    document.getElementById('buynow-dialog').showModal();
  }

  function setupBuyNowDialog() {
    const dialog = document.getElementById('buynow-dialog');
    document.getElementById('buynow-cancel').addEventListener('click', () => dialog.close());
    document.getElementById('buynow-confirm').addEventListener('click', async () => {
      dialog.close();
      try {
        const res = await api.post(`/listings/${encodeURIComponent(listingId)}/buy-now`, { confirm: true });
        item.status = 'ended';
        markClosed(closedText('buy_now', A.moneyToSatang(res.price)));
        el.msg.append(h('div', { class: 'alert alert-success' },
          `ซื้อทันทีสำเร็จ กรุณาชำระเงินภายใน ${new Date(res.paymentDueAt).toLocaleString('th-TH')} `,
          h('a', { href: '/pages/won.html', text: 'ไปที่รายการที่ชนะ' })));
      } catch (e) {
        setMessage('error', e.message);
      }
    });
  }

  // ---------- Socket.IO (api-spec 12) ----------
  // bid:new ไม่มี user id หรือวงเงินของใคร; "คุณเป็นผู้นำ" มาจาก bid:leader (ห้อง user:<id>) เท่านั้น
  const sameListing = (p) => p && String(p.listingId) === String(listingId);

  function onServerTime(p) { if (p) A.clock.sync(p.now); }

  function applyBidNew(p) {
    if (!sameListing(p)) return;
    if (p.serverTime != null) A.clock.sync(p.serverTime);
    // QA RT-2: ถ้าจำนวนบิดกระโดดเกิน 1 (พลาด event ไป) โหลดประวัติใหม่แทนการเติมแถวเดียว
    const missed = Number.isInteger(p.bidCount) && Number.isInteger(item.bidCount) && p.bidCount > item.bidCount + 1;
    item.currentPrice = A.moneyToSatang(p.currentPrice);
    item.minNextBid = A.moneyToSatang(p.minNextBid);
    if (Number.isInteger(p.bidCount)) item.bidCount = p.bidCount;
    if (Number.isFinite(A.toMs(p.endAt))) item.endAt = A.toMs(p.endAt);
    if (missed) loadHistory();
    else if (el.historyBody && p.amount != null) {
      el.historyBody.querySelectorAll('td[colspan]').forEach((td) => td.parentElement.remove());
      el.historyBody.prepend(historyRow({ bidder: p.bidder, bidType: p.bidType, amount: p.amount, createdAt: p.serverTime }));
    }
    paintAll();
    if (el.input && document.activeElement !== el.input) el.input.value = bahtInput(minNext());
  }

  function applyLeader(p) {
    if (!sameListing(p) || !viewer || viewer.kind !== 'bidder') return;
    viewer.isLeader = Boolean(p.isLeading);
    if (!viewer.isLeader) viewer.myMax = null;
    if (p.currentPrice != null) item.currentPrice = A.moneyToSatang(p.currentPrice);
    paintAll();
    if (!viewer.isLeader) A.flash('มีผู้เสนอราคาแซงคุณแล้ว');
  }

  function applyExtended(p) {
    if (!sameListing(p)) return;
    if (Number.isFinite(A.toMs(p.endAt))) item.endAt = A.toMs(p.endAt);
    if (Number.isInteger(p.extendCount)) item.extendCount = p.extendCount;
    paintAll();
    paintCountdown();
  }

  function applyClosed(p) {
    if (!sameListing(p)) return;
    // QA RT-3: ราคาใหญ่เป็นราคาปิด (finalPrice) และหยุด countdown
    item.status = 'ended';
    item.result = p.result;
    if (p.finalPrice != null) item.currentPrice = A.moneyToSatang(p.finalPrice);
    paintAll();
    paintCountdown();
    markClosed(closedText(p.result, A.moneyToSatang(p.finalPrice)));
    loadHistory();
  }

  async function connectSocket() {
    const socket = window.getSocket ? await window.getSocket() : null; // จาก layout.js (ส่ง token ให้อัตโนมัติ)
    if (!socket) return;
    const join = () => socket.emit('listing:join', listingId);
    let joinedBefore = socket.connected;
    if (socket.connected) join();
    // ต่อใหม่หลังหลุดต้อง join อีกครั้ง และ (QA RT-1) โหลดข้อมูลสินค้า (5.2) กับประวัติใหม่
    // เพราะระหว่างหลุดอาจพลาด bid:new / auction:extended / auction:closed ไป
    socket.on('connect', () => {
      join();
      if (joinedBefore) refresh();
      joinedBefore = true;
    });
    socket.on('server:time', onServerTime);
    socket.on('bid:new', applyBidNew);
    socket.on('bid:leader', applyLeader);
    socket.on('auction:extended', applyExtended);
    socket.on('auction:closed', applyClosed);
    window.addEventListener('pagehide', () => socket.emit('listing:leave', listingId));
  }

  // โหลดข้อมูลสินค้าใหม่ทั้งหน้า (หลังต่อ Socket ใหม่) เวลา ราคา ต่อเวลา และสถานะปิดมาจาก server
  async function refresh() {
    try {
      const d = await api.get(`/listings/${encodeURIComponent(listingId)}`);
      A.clock.sync(d.serverTime);
      item = normalizeDetail(d);
    } catch (e) {
      if (el.msg) setMessage('error', e.message);
      return;
    }
    viewer = getViewer(user);
    closed = false; // ถ้าเคยขึ้นปิดเพราะเวลาเก่า แต่จริงถูกต่อเวลา ต้องเปิดปุ่มคืน
    build();
    loadHistory();
    paintCountdown();
  }

  async function init() {
    await A.clockReady; // รอเวลา server ก่อนคำนวณเวลาที่เหลือ
    setupBuyNowDialog();
    if (!listingId) {
      root.replaceChildren(h('div', { class: 'alert alert-error', role: 'alert', text: 'ไม่พบรหัสสินค้า' }));
      return;
    }
    user = await A.whenUserReady(); // ต้องรู้ token ก่อน API จะตอบ me
    try {
      const d = await api.get(`/listings/${encodeURIComponent(listingId)}`);
      A.clock.sync(d.serverTime);
      item = normalizeDetail(d);
    } catch (e) {
      root.replaceChildren(h('div', { class: 'alert alert-error', role: 'alert', text: e.message }));
      return;
    }
    viewer = getViewer(user);
    build();
    loadHistory();
    paintCountdown();
    setInterval(paintCountdown, 1000);
    connectSocket();
  }

  window.ListingPage = { applyBidNew, applyLeader, applyExtended, applyClosed, onServerTime, refresh }; // ไว้เทสในเบราว์เซอร์
  init();
})();

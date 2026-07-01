// --- CORES & SYSTEM CONTEXT ENGINE ---
const TODAY = new Date().toISOString().slice(0, 10);

const CORE_TEMPLATES = [
  { id: 'daily_reminder', title: '⭐ Daily Reminder', body: `Namaste {name} ji,\n\nToday's ledger entry is *₹{today_amount}*.\nYour net outstanding ledger balance is *₹{total_debt}*.\n\nDate: {date}\nThank you,\n{shop_name}` },
  { id: 'payment_reminder', title: 'Payment Reminder', body: `Namaste {name} ji,\n\nThis is a friendly reminder regarding your outstanding balance of *₹{total_debt}*.\n\nYou can clear it directly via UPI click link:\n{payment_link}\nUPI Address: {upi_id}\n\nThank you for your business,\n{shop_name}` },
  { id: 'festival_greeting', title: 'Festival Greeting', body: `Greetings {name} ji!\n\nOn this auspicious day, {shop_name} wishes you peace and prosperity.\n\nJust a quick balance notation: Your current running account statement stands at *₹{total_debt}*.\n\nHave a blessed day!` },
  { id: 'payment_received', title: 'Payment Received', body: `Namaste {name} ji,\n\nWe have successfully received and accounted your payment allocation of *₹{today_amount}* on {date}.\n\nYour remaining unpaid balance is *₹{total_debt}*.\n\nLogged by: {shop_name}` }
];

const state = {
  customers: JSON.parse(localStorage.getItem('kf_v2_customers') || '{}'), 
  transactions: JSON.parse(localStorage.getItem('kf_v2_transactions') || '[]'),
  templates: JSON.parse(localStorage.getItem('kf_v2_templates') || 'null') || { activeId: 'daily_reminder', custom: CORE_TEMPLATES },
  business: JSON.parse(localStorage.getItem('kf_v2_business') || 'null') || {
    shopName: 'Aditya Kirana Store', ownerName: 'Aditya', businessId: 'ADITYA-KIRANA', upiId: '', businessPhone: ''
  },
  currentView: 'dashboard',
  selectedLedgerCustomerPhone: null,
  activeTxModalTargetPhone: null
};

// --- CORE UTILITY HELPER IMPLEMENTATIONS ---
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const money = (val) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);
const formatDate = (dStr) => {
  if (!dStr) return '—';
  return new Date(`${dStr}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};
const initials = (n) => n.split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();

function escapeHtml(val) {
  return String(val).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function saveToStorage() {
  localStorage.setItem('kf_v2_customers', JSON.stringify(state.customers));
  localStorage.setItem('kf_v2_transactions', JSON.stringify(state.transactions));
  localStorage.setItem('kf_v2_templates', JSON.stringify(state.templates));
  localStorage.setItem('kf_v2_business', JSON.stringify(state.business));
}

function showToast(title, msg) {
  const toast = $('#toast');
  $('#toastTitle').textContent = title;
  $('#toastMessage').textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function getCustomerMetrics(phone) {
  const list = state.transactions.filter(t => t.customerPhone === phone);
  let totalDebt = 0;
  let totalCredit = 0;
  let todayAmount = 0;
  let lastTxDate = '';

  list.forEach(t => {
    const amt = Number(t.amount || 0);
    if (t.type === 'DEBT') totalDebt += amt;
    else if (t.type === 'CREDIT') totalCredit += amt;
    
    if (t.date === TODAY) {
      todayAmount += (t.type === 'DEBT' ? amt : -amt);
    }
    if (!lastTxDate || t.date > lastTxDate) lastTxDate = t.date;
  });

  return { totalDebt, totalCredit, outstanding: totalDebt - totalCredit, todayAmount, lastTxDate };
}

function getSystemAggregateBalances() {
  let systemOutstanding = 0;
  let totalCollectionToday = 0;
  let todayNetChange = 0;
  let todayCount = 0;

  Object.keys(state.customers).forEach(p => {
    systemOutstanding += getCustomerMetrics(p).outstanding;
  });

  state.transactions.forEach(t => {
    if (t.date === TODAY) {
      todayCount++;
      const amt = Number(t.amount || 0);
      if (t.type === 'CREDIT') totalCollectionToday += amt;
      todayNetChange += (t.type === 'DEBT' ? amt : -amt);
    }
  });

  return { systemOutstanding, totalCollectionToday, todayNetChange, todayCount };
}

function buildPaymentLink(phone, amount) {
  if (!state.business.upiId) return '';
  const params = new URLSearchParams({
    pa: state.business.upiId,
    pn: state.business.shopName,
    am: Math.max(0, amount).toFixed(2),
    cu: 'INR',
    tn: `Statement Request - ${state.business.shopName}`
  });
  return `upi://pay?${params.toString()}`;
}

// --- VISUAL STRATEGY BINDING RE-WRITERS ---
function compileMessageString(phone, templateBody) {
  const cust = state.customers[phone];
  if (!cust) return '';
  const metrics = getCustomerMetrics(phone);
  const activeTemplate = templateBody || CORE_TEMPLATES[0].body;

  return activeTemplate
    .replaceAll('{name}', cust.name)
    .replaceAll('{date}', formatDate(TODAY))
    .replaceAll('{today_amount}', money(Math.abs(metrics.todayAmount)))
    .replaceAll('{total_debt}', money(metrics.outstanding))
    .replaceAll('{shop_name}', state.business.shopName)
    .replaceAll('{upi_id}', state.business.upiId || 'Not Configured')
    .replaceAll('{payment_link}', buildPaymentLink(phone, metrics.outstanding));
}

function navigateToView(viewId) {
  state.currentView = viewId;
  $$('.app-view').forEach(v => v.classList.remove('active'));
  
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === viewId));
  $$('.mobile-nav-item').forEach(m => m.classList.toggle('active', m.dataset.view === viewId));
  
  $(`#view-${viewId}`).classList.add('active');
  window.scrollTo(0, 0);
  renderCurrentView();
}

function renderCurrentView() {
  $('#sidebarAvatar').textContent = initials(state.business.ownerName || 'AK');
  $('#sidebarShopName').textContent = state.business.shopName;
  $('#welcomeOwner').innerHTML = `Good evening, ${escapeHtml(state.business.ownerName)} <span>👋</span>`;

  switch (state.currentView) {
    case 'dashboard': renderDashboardView(); break;
    case 'customers': renderCustomersView(); break;
    case 'transactions': renderTransactionsGlobalView(); break;
    case 'templates': renderTemplatesWorkspaceView(); break;
    case 'business': renderBusinessProfileView(); break;
    case 'ledger': renderCustomerLedgerView(); break;
  }
}

function renderDashboardView() {
  const aggs = getSystemAggregateBalances();
  $('#dashTodayNet').textContent = `₹${money(aggs.todayNetChange)}`;
  $('#dashTodayCount').textContent = `${aggs.todayCount} logs`;
  $('#dashTodayCollection').textContent = `₹${money(aggs.totalCollectionToday)}`;
  $('#dashTotalOutstanding').textContent = `₹${money(aggs.systemOutstanding)}`;

  const sortedTx = [...state.transactions].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 5);
  $('#dashTxEmpty').style.display = sortedTx.length ? 'none' : 'block';
  
  $('#dashTxBody').innerHTML = sortedTx.map(t => {
    const cust = state.customers[t.customerPhone] || { name: 'Unknown', phone: t.customerPhone };
    const isSent = t.sent === true;
    const isDebt = t.type === 'DEBT';
    
    return `<tr>
      <td style="padding-left: 16px;">
        <button class="primary-button quick-row-send-btn ${isSent ? 'dispatched-state' : ''}" data-txid="${t.id}" data-phone="${cust.phone}" style="padding: 6px 10px; font-size: 11px; margin:0; width:100%; text-align:center; background: ${isSent ? '#f0f2f1' : 'var(--wa)'}; box-shadow: none; color: ${isSent ? '#8a9491' : '#fff'};">
          ${isSent ? '✓ Sent' : '⚡ Send'}
        </button>
      </td>
      <td><strong>${escapeHtml(cust.name)}</strong></td>
      <td>${formatDate(t.date)}</td>
      <td>
        <span class="status ${isDebt ? 'pending' : 'sent'}">
          <i></i>${isDebt ? '🔴 DEBT' : '🟢 PAYMENT'}
        </span>
      </td>
      <td class="amount" style="text-align: right; padding-right: 16px; color: ${isDebt ? '#e11d48' : 'var(--green)'};">₹${money(t.amount)}</td>
    </tr>`;
  }).join('');

  const activeTodayPhones = Array.from(new Set(state.transactions.filter(t => t.date === TODAY).map(t => t.customerPhone)));
  $('#readyCount').textContent = `${activeTodayPhones.length} active today`;
  
  const recipientSelect = $('#recipientSelect');
  if (activeTodayPhones.length === 0) {
    recipientSelect.innerHTML = '<option value="">No targets active today</option>';
    $('#messagePreview').textContent = 'Log items first to test updates.';
  } else {
    recipientSelect.innerHTML = activeTodayPhones.map(p => {
      const c = state.customers[p];
      return `<option value="${p}">${escapeHtml(c.name)} (₹${money(getCustomerMetrics(p).outstanding)})</option>`;
    }).join('');
    updateDashboardMessagePreview();
  }
}

function updateDashboardMessagePreview() {
  const phone = $('#recipientSelect').value;
  if (!phone || !state.customers[phone]) return;
  $('#recipientAvatar').textContent = initials(state.customers[phone].name);
  const selectedTplObj = state.templates.custom.find(t => t.id === state.templates.activeId) || state.templates.custom[0];
  $('#messagePreview').textContent = compileMessageString(phone, selectedTplObj.body);
}

function renderCustomersView() {
  const query = $('#custSearchInput').value.toLowerCase().trim();
  const sort = $('#custSortSelect').value;
  let list = Object.values(state.customers).map(c => ({ ...c, metrics: getCustomerMetrics(c.phone) }));

  if (query) list = list.filter(c => c.name.toLowerCase().includes(query) || c.phone.includes(query));

  list.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'high') return b.metrics.outstanding - a.metrics.outstanding;
    if (sort === 'low') return a.metrics.outstanding - b.metrics.outstanding;
    return 0;
  });

  $('#customerTableEmpty').style.display = list.length ? 'none' : 'block';
  $('#customerDirectoryCount').textContent = `${list.length} Accounts`;

  $('#customerTableBody').innerHTML = list.map((c, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td>+91 ${escapeHtml(c.phone)}</td>
      <td class="amount" style="color: ${c.metrics.outstanding > 0 ? '#e11d48' : 'var(--green)'};">₹${money(c.metrics.outstanding)}</td>
      <td style="text-align:right;"><button class="primary-button view-ledger-btn" data-phone="${c.phone}" style="padding:6px 10px; font-size:11px;">Ledger →</button></td>
    </tr>
  `).join('');
}

function renderCustomerLedgerView() {
  const phone = state.selectedLedgerCustomerPhone;
  const cust = state.customers[phone];
  if (!cust) return navigateToView('customers');

  const metrics = getCustomerMetrics(phone);
  $('#ledgerCustName').textContent = cust.name;
  $('#ledgerCustPhone').textContent = `+91 ${cust.phone}`;
  $('#ledgerCallBtn').href = `tel:+91${cust.phone}`;
  
  $('#ledgerTotalDebt').textContent = `₹${money(metrics.totalDebt)}`;
  $('#ledgerTotalCredit').textContent = `₹${money(metrics.totalCredit)}`;
  $('#ledgerTotalOutstanding').textContent = `₹${money(metrics.outstanding)}`;

  const historicalTx = state.transactions.filter(t => t.customerPhone === phone).sort((a, b) => a.date.localeCompare(b.date));
  let runningBal = 0;

  $('#ledgerItemsBody').innerHTML = historicalTx.map(t => {
    runningBal += (t.type === 'DEBT' ? Number(t.amount) : -Number(t.amount));
    return `<tr>
      <td>${formatDate(t.date)}</td>
      <td>${escapeHtml(t.description || 'Reference entry')}</td>
      <td style="color:#e11d48; font-weight:700;">${t.type === 'DEBT' ? '₹' + money(t.amount) : '—'}</td>
      <td style="color:var(--green); font-weight:700;">${t.type === 'CREDIT' ? '₹' + money(t.amount) : '—'}</td>
      <td class="amount" style="font-weight: 800;">₹${money(runningBal)}</td>
      <td><button class="row-menu delete-tx-btn" data-id="${t.id}" style="color:#e11d48;">×</button></td>
    </tr>`;
  }).join('');
}

function renderTransactionsGlobalView() {
  const query = $('#txSearchInput').value.toLowerCase().trim();
  const dateF = $('#txDateFilterInput').value;
  const typeF = $('#txTypeFilterSelect').value;
  let list = [...state.transactions];

  if (query) list = list.filter(t => (t.description || '').toLowerCase().includes(query));
  if (dateF) list = list.filter(t => t.date === dateF);
  if (typeF !== 'ALL') list = list.filter(t => t.type === typeF);

  list.sort((a, b) => b.date.localeCompare(a.date));

  $('#txGlobalBody').innerHTML = list.map(t => {
    const cust = state.customers[t.customerPhone] || { name: 'Deleted Profile', phone: t.customerPhone };
    const isDebt = t.type === 'DEBT';
    return `<tr>
      <td>${formatDate(t.date)}</td>
      <td><strong>${escapeHtml(cust.name)}</strong></td>
      <td>${escapeHtml(t.description || '—')}</td>
      <td>
        <span class="status ${isDebt ? 'pending' : 'sent'}">${isDebt ? '🔴 DEBT' : '🟢 PAYMENT'}</span>
      </td>
      <td class="amount" style="color: ${isDebt ? '#e11d48' : 'var(--green)'};">₹${money(t.amount)}</td>
      <td style="text-align:right;"><button class="row-menu delete-tx-btn" data-id="${t.id}">🗑️</button></td>
    </tr>`;
  }).join('');
}

function renderTemplatesWorkspaceView() {
  const container = $('#templatesWorkspaceGrid');
  container.innerHTML = state.templates.custom.map(t => {
    const isActive = state.templates.activeId === t.id;
    return `<div class="sidebar-card" style="background:#fff; border: 1px solid ${isActive ? 'var(--teal)' : 'var(--line)'}; margin:0; display:grid; gap:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${escapeHtml(t.title)}</strong>
        <span class="status ${isActive ? 'sent' : 'pending'}" style="${isActive ? '' : 'background:#f0f3f2; color:var(--muted);'}">${isActive ? 'Active Default' : 'Standby'}</span>
      </div>
      <pre style="white-space:pre-wrap; background:var(--canvas); padding:10px; border-radius:8px; font-size:11px; margin:4px 0; font-family:inherit;">${escapeHtml(t.body)}</pre>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button class="primary-button make-template-active-btn" data-id="${t.id}" style="padding:6px 12px; font-size:11px; background:${isActive ? 'var(--muted)' : 'var(--teal)'}" ${isActive ? 'disabled' : ''}>Use This</button>
      </div>
    </div>`;
  }).join('');

  $('#previewTemplateMenu').innerHTML = state.templates.custom.map(t => `
    <button class="dropdown-item select-preview-tpl-action" data-id="${t.id}">${escapeHtml(t.title)}</button>
  `).join('');
}

function renderBusinessProfileView() {
  const f = $('#businessPageForm');
  f.elements.shopName.value = state.business.shopName;
  f.elements.ownerName.value = state.business.ownerName;
  f.elements.businessId.value = state.business.businessId;
  f.elements.upiId.value = state.business.upiId;
  f.elements.businessPhone.value = state.business.businessPhone || '';
}

function openModal(el) { el.classList.add('open'); el.setAttribute('aria-hidden', 'false'); }
function closeModal(el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }

function openTransactionModal(preSelectedPhone = null, targetClassification = 'DEBT') {
  const form = $('#txModalForm');
  form.reset();
  $('#txModalForm [name="date"]').value = TODAY;
  $('#txModalTypeSelect').value = targetClassification;
  
  if (preSelectedPhone && state.customers[preSelectedPhone]) {
    state.activeTxModalTargetPhone = preSelectedPhone;
    $('#txModalSearchCust').style.display = 'none';
    $('#txModalRecentContainer').style.display = 'none';
    $('#txModalAccountStatus').style.display = 'flex';
    $('#txModalSelectedName').textContent = state.customers[preSelectedPhone].name;
    $('#txModalSelectedBalance').textContent = `Outstanding: ₹${money(getCustomerMetrics(preSelectedPhone).outstanding)}`;
    $('#txModalFields').style.display = 'grid';
  } else {
    state.activeTxModalTargetPhone = null;
    $('#txModalSearchCust').style.display = 'block';
    $('#txModalSearchCust').value = '';
    $('#txModalAccountStatus').style.display = 'none';
    $('#txModalFields').style.display = 'none';
    hydrateRecentCustomerBadges();
  }
  openModal($('#txModal'));
}

function borderAlignFormCleaners() {
  // Clear lingering selection listeners across dynamic views
}

function hydrateRecentCustomerBadges() {
  const dynamicPhones = Array.from(new Set(state.transactions.map(t => t.customerPhone))).slice(-3);
  $('#txModalRecentContainer').style.display = 'block';
  
  let badgesHtml = dynamicPhones.map(p => {
    const name = state.customers[p] ? state.customers[p].name.split(' ')[0] : 'User';
    return `<button type="button" class="secondary-button tx-quick-badge" data-phone="${p}" style="margin:0; padding:6px 12px; font-size:11px; background:#f0f2f1; border-radius:8px; color:var(--ink); border:1px solid var(--line);"> ${escapeHtml(name)} </button>`;
  }).join('');
  
  $('#txModalRecentBadges').innerHTML = badgesHtml + `<button type="button" class="primary-button" id="txModalCreateNewCustBtn" data-name="" style="padding:6px 12px; font-size:11px; background:var(--ink); border-radius:8px;">＋ New Account</button>`;
}

// --- ATTACH LISTENERS IN LIFECYCLE INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  // EXPLICIT SIDEBAR & BOTTOM MOBILE FOOTER ROUTING BINDING MECHANISM
  $$('.nav-item, .mobile-nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = btn.getAttribute('data-view');
      if (targetView) navigateToView(targetView);
    });
  });

  $('#navBrand').addEventListener('click', (e) => { e.preventDefault(); navigateToView('dashboard'); });
  $('#sidebarProfileBtn').addEventListener('click', () => navigateToView('business'));

  // Table Delegation Clicks
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('quick-row-send-btn')) {
      const txId = e.target.dataset.txid;
      const phone = e.target.dataset.phone;
      
      const targetTx = state.transactions.find(t => t.id === txId);
      if (targetTx) {
        targetTx.sent = true;
        saveToStorage();
        e.target.classList.add('dispatched-state');
        e.target.style.background = '#f0f2f1';
        e.target.style.color = '#8a9491';
        e.target.textContent = '✓ Sent';
      }
      
      const defaultTpl = state.templates.custom.find(t => t.id === state.templates.activeId) || state.templates.custom[0];
      window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(compileMessageString(phone, defaultTpl.body))}`, '_blank', 'noopener,noreferrer');
    }
  });

  $('#mobileDeviceContactImportBtn').addEventListener('click', async () => {
    if (!navigator.contacts || !navigator.contacts.select) {
      showToast('Notice', 'Smartphone permissions block reading APIs. Fill fields manually below.');
      return;
    }
    try {
      const pickedContacts = await navigator.contacts.select(['name', 'tel'], { multiple: false });
      if (pickedContacts && pickedContacts.length > 0) {
        const targetPerson = pickedContacts[0];
        $('#customerQuickForm [name="name"]').value = targetPerson.name?.[0] || '';
        $('#customerQuickForm [name="phone"]').value = String(targetPerson.tel?.[0] || '').replace(/\D/g, '').slice(-10);
        showToast('Complete', 'Coordinates mapped.');
      }
    } catch (err) {
      showToast('Interrupted', 'Manual mode.');
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('view-ledger-btn')) {
      state.selectedLedgerCustomerPhone = e.target.dataset.phone;
      navigateToView('ledger');
    }
    if (e.target.classList.contains('tx-quick-badge')) {
      openTransactionModal(e.target.dataset.phone);
    }
  });

  $('#custSearchInput').addEventListener('input', renderCustomersView);
  $('#custSortSelect').addEventListener('change', renderCustomersView);
  $('#txSearchInput').addEventListener('input', renderTransactionsGlobalView);
  $('#txDateFilterInput').addEventListener('change', renderTransactionsGlobalView);
  $('#txTypeFilterSelect').addEventListener('change', renderTransactionsGlobalView);
  $('#recipientSelect').addEventListener('change', updateDashboardMessagePreview);

  $('#globalAddTxBtn').addEventListener('click', () => openTransactionModal());
  $('#dashViewAllTxBtn').addEventListener('click', () => navigateToView('transactions'));
  
  $('#createCustomerQuickBtn').addEventListener('click', () => {
    $('#customerQuickForm').reset();
    openModal($('#customerQuickModal'));
  });
  
  $('#ledgerBackBtn').addEventListener('click', () => navigateToView('customers'));
  $('#ledgerAddDebtBtn').addEventListener('click', () => openTransactionModal(state.selectedLedgerCustomerPhone, 'DEBT'));
  $('#ledgerAddPaymentBtn').addEventListener('click', () => openTransactionModal(state.selectedLedgerCustomerPhone, 'CREDIT'));
  $('#ledgerPrintBtn').addEventListener('click', () => { window.print(); });

  // STRICT LOOKUP MATCH CONTROLLER (REQUIRES LINK CLICK)
  $('#txModalSearchCust').addEventListener('input', (e) => {
    const txt = e.target.value.trim();
    if (!txt) {
      hydrateRecentCustomerBadges();
      return;
    }
    
    if (/^\d{11}$|^\d{10}$/.test(txt)) {
      const formattedNumber = txt.slice(-10);
      if (state.customers[formattedNumber]) {
        openTransactionModal(formattedNumber, $('#txModalTypeSelect').value);
        return;
      }
    }
    
    const searchMatches = Object.values(state.customers).filter(c => c.name.toLowerCase().includes(txt.toLowerCase()));
    $('#txModalRecentContainer').style.display = 'block';
    
    if (searchMatches.length > 0) {
      $('#txModalRecentBadges').innerHTML = searchMatches.slice(0, 3).map(c => `
        <button type="button" class="secondary-button tx-quick-badge" data-phone="${c.phone}" style="margin:0; padding:6px 12px; font-size:11px; background:#eaf5f2; color:var(--teal); border:1px solid var(--line); border-radius:8px;">
          Link: ${escapeHtml(c.name)}
        </button>
      `).join('') + `
        <button type="button" class="primary-button" id="txModalCreateNewCustBtn" data-name="${escapeHtml(txt)}" style="padding:6px 12px; font-size:11px; background:var(--ink); border-radius:8px;">
          ＋ Create "${escapeHtml(txt)}"
        </button>
      `;
    } else {
      $('#txModalRecentBadges').innerHTML = `
        <button type="button" class="primary-button" id="txModalCreateNewCustBtn" data-name="${escapeHtml(txt)}" style="padding:12px; background:var(--teal); width:100%; text-align:center; border-radius:10px; color:#fff;">
          ＋ Create New Account for "${escapeHtml(txt)}"
        </button>
      `;
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.id === 'txModalCreateNewCustBtn') {
      const typedName = e.target.dataset.name;
      $('#customerQuickForm').reset();
      $('#quickCustNameField').value = typedName || '';
      openModal($('#customerQuickModal'));
    }
  });

  $('#customerQuickForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const p = String(fd.get('phone')).replace(/\D/g, '').slice(-10);
    if (p.length !== 10) return showToast('Validation Error', 'Provide 10 digits.');
    
    state.customers[p] = { id: crypto.randomUUID(), name: fd.get('name').trim(), phone: p, createdAt: new Date().toISOString() };
    saveToStorage();
    closeModal($('#customerQuickModal'));
    showToast('Success', 'Profile generated.');
    
    if (state.currentView === 'customers') renderCustomersView();
    openTransactionModal(p, $('#txModalTypeSelect').value);
  });

  $('#txModalForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.activeTxModalTargetPhone) return showToast('Error', 'Link a customer profile card.');
    
    const fd = new FormData(e.currentTarget);
    state.transactions.push({
      id: 'tx-' + Date.now(),
      customerPhone: state.activeTxModalTargetPhone,
      type: fd.get('type'),
      amount: Number(fd.get('amount')),
      date: fd.get('date'),
      description: fd.get('description').trim(),
      sent: false
    });
    
    saveToStorage();
    closeModal($('#txModal'));
    showToast('Success', 'Ledger updated.');
    renderCurrentView();
  });

  $('#businessPageForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    state.business = {
      shopName: fd.get('shopName').trim(),
      ownerName: fd.get('ownerName').trim(),
      businessId: fd.get('businessId').trim().toUpperCase().replace(/\s+/g, '-'),
      upiId: fd.get('upiId').trim(),
      businessPhone: fd.get('businessPhone').trim()
    };
    saveToStorage();
    showToast('Saved', 'Profile settings updated.');
    renderCurrentView();
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-tx-btn')) {
      const id = e.target.dataset.id;
      if (!id || !confirm('Delete this entry?')) return;
      state.transactions = state.transactions.filter(t => t.id !== id);
      saveToStorage();
      showToast('Cleared', 'Historical record removed.');
      renderCurrentView();
    }
  });

  $('#templateModalForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    state.templates.custom.push({ id: 'tpl-' + Date.now(), title: fd.get('title').trim(), body: fd.get('body').trim() });
    saveToStorage();
    closeModal($('#templateModal'));
    renderTemplatesWorkspaceView();
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('make-template-active-btn')) {
      state.templates.activeId = e.target.dataset.id;
      saveToStorage();
      showToast('Switched', 'Primary default updated.');
      renderTemplatesWorkspaceView();
    }
  });

  $('#previewTemplateDropdownBtn').addEventListener('click', () => $('#previewTemplateMenu').classList.toggle('show'));
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('select-preview-tpl-action')) {
      state.templates.activeId = e.target.dataset.id;
      saveToStorage();
      updateDashboardMessagePreview();
    }
    if (e.target.id !== 'previewTemplateDropdownBtn') $('#previewTemplateMenu').classList.remove('show');
  });

  function fireWhatsAppTransactionNotification() {
    const phone = $('#recipientSelect').value;
    if (!phone) return showToast('Selection Fault', 'No active profile selection.');
    const msg = $('#messagePreview').textContent;
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
    
    const recipientSelect = $('#recipientSelect');
    const currentIndex = recipientSelect.selectedIndex;
    if (currentIndex !== -1 && currentIndex < recipientSelect.options.length - 1) {
      recipientSelect.selectedIndex = currentIndex + 1;
      updateDashboardMessagePreview();
      showToast('Queue Advanced', 'Next statement compiled!');
    }
  }

  $('#sendWhatsAppBtn').addEventListener('click', fireWhatsAppTransactionNotification);
  
  $('#ledgerWaBtn').addEventListener('click', () => {
    const phone = state.selectedLedgerCustomerPhone;
    const defaultTpl = state.templates.custom.find(t => t.id === state.templates.activeId) || state.templates.custom[0];
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(compileMessageString(phone, defaultTpl.body))}`, '_blank');
  });

  $('#txModalClearCustBtn').addEventListener('click', () => openTransactionModal(null));
  $$('.close-modal, .cancel-button').forEach(b => b.addEventListener('click', (e) => closeModal(e.target.closest('.modal-backdrop'))));

  const dtText = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#todayLabel').textContent = dtText.toUpperCase();
  navigateToView('dashboard');
});

// --- CORES & SYSTEM CONTEXT ENGINE ---
const TODAY = new Date().toISOString().slice(0, 10);

// Default Built-in Storage Templates
const CORE_TEMPLATES = [
  { id: 'daily_reminder', title: '⭐ Daily Reminder', body: `Namaste {name} ji,\n\nToday's ledger entry is *₹{today_amount}*.\nYour net outstanding ledger balance is *₹{total_debt}*.\n\nDate: {date}\nThank you,\n{shop_name}` },
  { id: 'payment_reminder', title: 'Payment Reminder', body: `Namaste {name} ji,\n\nThis is a friendly reminder regarding your outstanding balance of *₹{total_debt}*.\n\nYou can clear it directly via UPI click link:\n{payment_link}\nUPI Address: {upi_id}\n\nThank you for your business,\n{shop_name}` },
  { id: 'festival_greeting', title: 'Festival Greeting', body: `Greetings {name} ji!\n\nOn this auspicious day, {shop_name} wishes you peace and prosperity.\n\nJust a quick balance notation: Your current running account statement stands at *₹{total_debt}*.\n\nHave a blessed day!` },
  { id: 'payment_received', title: 'Payment Received', body: `Namaste {name} ji,\n\nWe have successfully received and accounted your payment allocation of *₹{today_amount}* on {date}.\n\nYour remaining unpaid balance is *₹{total_debt}*.\n\nLogged by: {shop_name}` }
];

// Structural Client V2 Database State Restoration Engine
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

// --- CORE UTILITY HELPER WRAPPERS ---
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

// --- CORE BALANCE CALCULATION ENGINES ---
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

  return {
    totalDebt,
    totalCredit,
    outstanding: totalDebt - totalCredit,
    todayAmount,
    lastTxDate
  };
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

// --- WHATSAPP & UPI BUILD ENGINES ---
function buildPaymentLink(phone, amount) {
  if (!state.business.upiId) return '';
  const cust = state.customers[phone];
  const params = new URLSearchParams({
    pa: state.business.upiId,
    pn: state.business.shopName,
    am: Math.max(0, amount).toFixed(2),
    cu: 'INR',
    tn: `Statement settlement for ${cust ? cust.name : 'Customer'}`
  });
  return `upi://pay?${params.toString()}`;
}

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

// --- SINGLE PAGE VIEW ROUTER ---
function navigateToView(viewId) {
  state.currentView = viewId;
  $$('.app-view').forEach(v => v.classList.remove('active'));
  $$('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.view === viewId);
  });
  $(`#view-${viewId}`).classList.add('active');
  renderCurrentView();
}

// --- CORE APP RENDERING ROUTER ---
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

// --- VIEW WRITERS ---
function renderDashboardView() {
  const aggs = getSystemAggregateBalances();
  $('#dashTodayNet').textContent = `₹${money(aggs.todayNetChange)}`;
  $('#dashTodayCount').textContent = `${aggs.todayCount} ${aggs.todayCount === 1 ? 'log' : 'logs'}`;
  $('#dashTodayCollection').textContent = `₹${money(aggs.totalCollectionToday)}`;
  $('#dashTotalOutstanding').textContent = `₹${money(aggs.systemOutstanding)}`;

  const sortedTx = [...state.transactions].sort((a, b) => b.id.localeCompare(a.id)).slice(0, 5);
  $('#dashTxEmpty').style.display = sortedTx.length ? 'none' : 'block';
  
  $('#dashTxBody').innerHTML = sortedTx.map(t => {
    const cust = state.customers[t.customerPhone] || { name: 'Unknown Account', phone: t.customerPhone };
    return `<tr>
      <td><div class="customer-cell"><span class="avatar">${initials(cust.name)}</span><div><strong>${escapeHtml(cust.name)}</strong><span>+91 ${escapeHtml(cust.phone)}</span></div></div></td>
      <td>${formatDate(t.date)}</td>
      <td>${escapeHtml(t.description || '—')}</td>
      <td><span class="status ${t.type === 'DEBT' ? 'pending' : 'sent'}"><i></i>${t.type}</span></td>
      <td class="amount">₹${money(t.amount)}</td>
    </tr>`;
  }).join('');

  const activeTodayPhones = Array.from(new Set(state.transactions.filter(t => t.date === TODAY).map(t => t.customerPhone)));
  $('#readyCount').textContent = `${activeTodayPhones.length} customer account updates logged today`;
  
  const recipientSelect = $('#recipientSelect');
  const lastSelected = recipientSelect.value;
  
  if (activeTodayPhones.length === 0) {
    recipientSelect.innerHTML = '<option value="">No context targets available today</option>';
    $('#recipientAvatar').textContent = '—';
    $('#messagePreview').textContent = 'Log transactions first to test dispatch pipelines.';
  } else {
    recipientSelect.innerHTML = activeTodayPhones.map(p => {
      const c = state.customers[p];
      return `<option value="${p}">${escapeHtml(c.name)} (Outstanding: ₹${money(getCustomerMetrics(p).outstanding)})</option>`;
    }).join('');
    if (activeTodayPhones.includes(lastSelected)) recipientSelect.value = lastSelected;
    updateDashboardMessagePreview();
  }
  $('#upiStatusText').textContent = state.business.upiId ? `Active Direct Gateway: ${state.business.upiId}` : 'Links Disabled - Set UPI ID in business profile';
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

  if (query) {
    list = list.filter(c => c.name.toLowerCase().includes(query) || c.phone.includes(query));
  }

  list.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'high') return b.metrics.outstanding - a.metrics.outstanding;
    if (sort === 'low') return a.metrics.outstanding - b.metrics.outstanding;
    if (sort === 'recent') return (b.metrics.lastTxDate || '').localeCompare(a.metrics.lastTxDate || '');
    return 0;
  });

  $('#customerTableEmpty').style.display = list.length ? 'none' : 'block';
  $('#customerDirectoryCount').textContent = `${Object.keys(state.customers).length} Total Accounts`;

  $('#customerTableBody').innerHTML = list.map((c, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td>+91 ${escapeHtml(c.phone)}</td>
      <td class="amount" style="color: ${c.metrics.outstanding > 0 ? '#e11d48' : c.metrics.outstanding < 0 ? 'var(--green)' : 'var(--muted)'};">
        ₹${money(c.metrics.outstanding)}
      </td>
      <td style="text-align:right;">
        <button class="primary-button view-ledger-btn" data-phone="${c.phone}" style="padding: 6px 12px; font-size:11px;">View Ledger Statement →</button>
      </td>
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
  
  $('#ledgerOutstandingCard').style.background = metrics.outstanding > 0 ? '#e11d48' : 'var(--teal)';

  const historicalTx = state.transactions.filter(t => t.customerPhone === phone).sort((a, b) => a.date.localeCompare(b.date));
  let runningBal = 0;

  $('#ledgerItemsBody').innerHTML = historicalTx.map(t => {
    if (t.type === 'DEBT') runningBal += Number(t.amount);
    else runningBal -= Number(t.amount);

    return `<tr>
      <td>${formatDate(t.date)}</td>
      <td>${escapeHtml(t.description || 'Reference entry')}</td>
      <td style="color:#e11d48; font-weight:700;">${t.type === 'DEBT' ? '₹' + money(t.amount) : '—'}</td>
      <td style="color:var(--green); font-weight:700;">${t.type === 'CREDIT' ? '₹' + money(t.amount) : '—'}</td>
      <td class="amount">₹${money(runningBal)}</td>
      <td><button class="row-menu delete-tx-btn" data-id="${t.id}" style="color:#e11d48; font-size:16px;">×</button></td>
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
    const cust = state.customers[t.customerPhone] || { name: 'Legacy Deleted Profile', phone: t.customerPhone };
    return `<tr>
      <td>${formatDate(t.date)}</td>
      <td><strong>${escapeHtml(cust.name)}</strong><br/><small style="color:var(--muted)">+91 ${cust.phone}</small></td>
      <td>${escapeHtml(t.description || '—')}</td>
      <td><span class="status ${t.type === 'DEBT' ? 'pending' : 'sent'}">${t.type}</span></td>
      <td class="amount">₹${money(t.amount)}</td>
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
        <strong style="font-size:14px; color:var(--ink);">${escapeHtml(t.title)}</strong>
        <span class="status ${isActive ? 'sent' : 'pending'}">${isActive ? 'Active Default' : 'Standby'}</span>
      </div>
      <pre style="white-space:pre-wrap; background:var(--canvas); padding:10px; border-radius:8px; font-size:11px; margin:4px 0; font-family:inherit;">${escapeHtml(t.body)}</pre>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:4px;">
        <button class="primary-button make-template-active-btn" data-id="${t.id}" style="padding:6px 12px; font-size:11px; background:${isActive ? 'var(--muted)' : 'var(--teal)'}" ${isActive ? 'disabled' : ''}>Set Primary</button>
        <button class="secondary-button delete-template-btn" data-id="${t.id}" style="padding:6px 12px; font-size:11px; margin:0; color:#e11d48;" ${['daily_reminder','payment_reminder','festival_greeting','payment_received'].includes(t.id) ? 'disabled style="opacity:0.3;"' : ''}>Delete</button>
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

// --- INTERACTIVE SYSTEM MODAL UTILITIES ---
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
    setTimeout(() => form.querySelector('[name="amount"]').focus(), 150);
  } else {
    state.activeTxModalTargetPhone = null;
    $('#txModalSearchCust').style.display = 'block';
    $('#txModalSearchCust').value = '';
    $('#txModalAccountStatus').style.display = 'none';
    $('#txModalFields').style.display = 'none';
    hydrateRecentCustomerBadges();
    setTimeout(() => $('#txModalSearchCust').focus(), 150);
  }
  openModal($('#txModal'));
}

function hydrateRecentCustomerBadges() {
  const dynamicPhones = Array.from(new Set(state.transactions.map(t => t.customerPhone))).slice(-4);
  
  if (dynamicPhones.length === 0) {
    $('#txModalRecentContainer').style.display = 'none';
  } else {
    $('#txModalRecentContainer').style.display = 'block';
    $('#txModalRecentBadges').innerHTML = dynamicPhones.map(p => {
      const name = state.customers[p] ? state.customers[p].name.split(' ')[0] : 'Merchant';
      return `<button type="button" class="secondary-button tx-quick-badge" data-phone="${p}" style="margin:0; padding:4px 10px; font-size:11px;">${escapeHtml(name)}</button>`;
    }).join('') + `<button type="button" class="primary-button" id="txModalCreateNewCustBtn" style="padding:4px 10px; font-size:11px; background:var(--ink);">＋ New Account</button>`;
  }
}

// --- SYSTEM LOGIC MOUNT ASSEMBLIES ---
document.addEventListener('DOMContentLoaded', () => {
  $$('.nav-item').forEach(i => i.addEventListener('click', () => navigateToView(i.dataset.view)));
  $('#navBrand').addEventListener('click', (e) => { e.preventDefault(); navigateToView('dashboard'); });
  $('#sidebarProfileBtn').addEventListener('click', () => navigateToView('business'));

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
  $('#createCustomerQuickBtn').addEventListener('click', () => openModal($('#customerQuickModal')));
  
  $('#ledgerBackBtn').addEventListener('click', () => navigateToView('customers'));
  $('#ledgerAddDebtBtn').addEventListener('click', () => openTransactionModal(state.selectedLedgerCustomerPhone, 'DEBT'));
  $('#ledgerAddPaymentBtn').addEventListener('click', () => openTransactionModal(state.selectedLedgerCustomerPhone, 'CREDIT'));
  $('#ledgerPrintBtn').addEventListener('click', () => { window.print(); });

  $('#txModalSearchCust').addEventListener('input', (e) => {
    const txt = e.target.value.toLowerCase().trim();
    if (!txt) return;
    const match = Object.values(state.customers).find(c => c.name.toLowerCase().includes(txt) || c.phone.includes(txt));
    if (match) {
      openTransactionModal(match.phone, $('#txModalTypeSelect').value);
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.id === 'txModalCreateNewCustBtn') {
      openModal($('#customerQuickModal'));
    }
  });

  $('#customerQuickForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const p = String(fd.get('phone')).replace(/\D/g, '').slice(-10);
    if (p.length !== 10) return showToast('Validation Error', 'Enter 10-digit smartphone index.');
    
    state.customers[p] = { id: crypto.randomUUID(), name: fd.get('name').trim(), phone: p, createdAt: new Date().toISOString() };
    saveToStorage();
    closeModal($('#customerQuickModal'));
    showToast('Success', 'Profile index added.');
    
    if (state.currentView === 'customers') renderCustomersView();
    if ($('#txModal').classList.contains('open')) openTransactionModal(p, $('#txModalTypeSelect').value);
  });

  $('#txModalForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.activeTxModalTargetPhone) return showToast('Error Context', 'Link a customer profile card.');
    
    const fd = new FormData(e.currentTarget);
    state.transactions.push({
      id: 'tx-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      customerPhone: state.activeTxModalTargetPhone,
      type: fd.get('type'),
      amount: Number(fd.get('amount')),
      date: fd.get('date'),
      description: fd.get('description').trim()
    });
    
    saveToStorage();
    closeModal($('#txModal'));
    showToast('Balance Authenticated', 'Ledger balances recalculated smoothly.');
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
    showToast('Saved Settings', 'System configurations sync committed.');
    renderCurrentView();
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-tx-btn')) {
      const id = e.target.dataset.id;
      if (!id || !confirm('Permanently purge this ledger entry?')) return;
      state.transactions = state.transactions.filter(t => t.id !== id);
      saveToStorage();
      showToast('Record Cleared', 'Historical offsets updated.');
      renderCurrentView();
    }
  });

  $('#templateCreateBtn').addEventListener('click', () => {
    const f = $('#templateModalForm');
    f.reset();
    f.elements.id.value = '';
    $('#templateModalTitle').textContent = 'Create Custom Message Template';
    openModal($('#templateModal'));
  });

  $('#templateModalForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const existingId = fd.get('id');
    
    if (existingId) {
      const target = state.templates.custom.find(t => t.id === existingId);
      if (target) { target.title = fd.get('title'); target.body = fd.get('body'); }
    } else {
      state.templates.custom.push({
        id: 'tpl-' + Date.now(),
        title: fd.get('title').trim(),
        body: fd.get('body').trim()
      });
    }
    saveToStorage();
    closeModal($('#templateModal'));
    showToast('Template Stored', 'Layout rules mapped successfully.');
    renderTemplatesWorkspaceView();
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('make-template-active-btn')) {
      state.templates.activeId = e.target.dataset.id;
      saveToStorage();
      showToast('Context Target Fixed', 'Primary default message template switched.');
      renderTemplatesWorkspaceView();
    }
    if (e.target.classList.contains('delete-template-btn')) {
      const id = e.target.dataset.id;
      state.templates.custom = state.templates.custom.filter(t => t.id !== id);
      if (state.templates.activeId === id) state.templates.activeId = 'daily_reminder';
      saveToStorage();
      renderTemplatesWorkspaceView();
    }
  });

  $('#previewTemplateDropdownBtn').addEventListener('click', () => {
    $('#previewTemplateMenu').classList.toggle('show');
  });
  
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('select-preview-tpl-action')) {
      state.templates.activeId = e.target.dataset.id;
      saveToStorage();
      $('#previewTemplateMenu').classList.remove('show');
      updateDashboardMessagePreview();
    } else if (e.target.id !== 'previewTemplateDropdownBtn') {
      $('#previewTemplateMenu').classList.remove('show');
    }
  });

  function fireWhatsAppTransactionNotification() {
    const phone = $('#recipientSelect').value;
    if (!phone) return showToast('Selection Fault', 'Pick an operational smartphone entry.');
    const msg = $('#messagePreview').textContent;
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  }

  const waSendBtn = $('#sendWhatsAppBtn');
  waSendBtn.addEventListener('click', fireWhatsAppTransactionNotification);
  waSendBtn.addEventListener('dblclick', () => { navigateToView('templates'); });
  
  $('#ledgerWaBtn').addEventListener('click', () => {
    const phone = state.selectedLedgerCustomerPhone;
    const defaultTpl = state.templates.custom.find(t => t.id === state.templates.activeId) || state.templates.custom[0];
    const rawMsg = compileMessageString(phone, defaultTpl.body);
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(rawMsg)}`, '_blank', 'noopener,noreferrer');
  });

  $('#txModalClearCustBtn').addEventListener('click', () => openTransactionModal(null));
  
  $$('.close-modal, .cancel-button').forEach(b => b.addEventListener('click', (e) => {
    closeModal(e.target.closest('.modal-backdrop'));
  }));

  const dtText = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#todayLabel').textContent = dtText.toUpperCase();
  navigateToView('dashboard');
});
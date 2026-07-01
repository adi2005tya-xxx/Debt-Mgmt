// ============================================================================
// --- CREDTRACK CORE ENGINE & LIFECYCLE MANAGEMENT ---
// ============================================================================

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

// --- CORE UTILITY HELPERS ---
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const money = (val) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);

const formatDate = (dStr) => {
  if (!dStr) return '—';
  return new Date(`${dStr}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const initials = (n) => {
  if (!n) return '??';
  return n.split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
};

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
  if (!toast) return;
  $('#toastTitle').textContent = title;
  $('#toastMessage').textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
}

// --- DATA CALCULATION COMPILERS ---
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
    tn: `Payment request from ${state.business.shopName}`
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

// ============================================================================
// --- VIEW ROUTING AND RENDER DOM LOGIC ---
// ============================================================================

function navigateToView(viewId) {
  state.currentView = viewId;
  
  // Hide all view panels across systems
  $$('.app-view').forEach(v => v.classList.remove('active'));
  
  // Toggle layout structural classes for desktop sidebar & mobile navigation bars simultaneously
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === viewId));
  $$('.mobile-nav-item').forEach(m => m.classList.toggle('active', m.dataset.view === viewId));
  
  const targetView = $(`#view-${viewId}`);
  if (targetView) targetView.classList.add('active');
  
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
    const cust = state.customers[t.customerPhone] || { name: 'Unknown User', phone: t.customerPhone };
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
    $('#messagePreview').textContent = 'Log items first to view message templates.';
    $('#recipientAvatar').textContent = '—';
  } else {
    recipientSelect.innerHTML = activeTodayPhones.map(p => {
      const c = state.customers[p];
      return `<option value="${p}">${escapeHtml(c.name)} (₹${money(getCustomerMetrics(p).outstanding)})</option>`;
    }).join('');
    updateDashboardMessagePreview();
  }

  $('#upiStatusText').textContent = state.business.upiId ? `UPI Configured (${state.business.upiId})` : 'UPI Missing - Configure via Profile';
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
    if (sort === 'recent') return b.metrics.lastTxDate.localeCompare(a.metrics.lastTxDate);
    return 0;
  });

  $('#customerTableEmpty').style.display = list.length ? 'none' : 'block';
  $('#customerDirectoryCount').textContent = `${list.length} Total Accounts`;

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

  const trackingCard = $('#ledgerOutstandingCard');
  if (trackingCard) {
    trackingCard.style.background = metrics.outstanding > 0 ? '#e11d48' : 'var(--green)';
  }

  const historicalTx = state.transactions.filter(t => t.customerPhone === phone).sort((a, b) => a.date.localeCompare(b.date));
  let runningBal = 0;

  $('#ledgerItemsBody').innerHTML = historicalTx.map(t => {
    runningBal += (t.type === 'DEBT' ? Number(t.amount) : -Number(t.amount));
    return `<tr>
      <td>${formatDate(t.date)}</td>
      <td>${escapeHtml(t.description || 'Ledger reference entry')}</td>
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

  if (query) list = list.filter(t => (t.description || '').toLowerCase().includes(query) || t.customerPhone.includes(query));
  if (dateF) list = list.filter(t => t.date === dateF);
  if (typeF !== 'ALL') list = list.filter(t => t.type === typeF);

  list.sort((a, b) => b.id.localeCompare(a.id));

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
  const menuDropdown = $('#previewTemplateMenu');
  
  container.innerHTML = state.templates.custom.map(t => {
    const isActive = state.templates.activeId === t.id;
    return `<div class="sidebar-card" style="background:#fff; border: 1px solid ${isActive ? 'var(--teal)' : 'var(--line)'}; margin:0; display:grid; gap:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <strong>${escapeHtml(t.title)}</strong>
        <span class="status ${isActive ? 'sent' : 'pending'}" style="${isActive ? '' : 'background:#f0f3f2; color:var(--muted);'}">${isActive ? 'Active Default' : 'Standby'}</span>
      </div>
      <pre style="margin:4px 0; font-family:inherit; font-size:12px; white-space:pre-wrap; color:var(--ink); line-height:1.5;">${escapeHtml(t.body)}</pre>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:4px;">
        <button class="text-button make-default-template-btn" data-id="${t.id}" style="font-size:11px;" ${isActive ? 'disabled' : ''}>Make Default</button>
        <button class="text-button edit-template-btn" data-id="${t.id}" style="font-size:11px; color:var(--ink);">Edit</button>
      </div>
    </div>`;
  }).join('');

  if (menuDropdown) {
    menuDropdown.innerHTML = state.templates.custom.map(t => `
      <button type="button" class="dropdown-item select-preview-template-btn" data-id="${t.id}">
        ${state.templates.activeId === t.id ? '✓ ' : ''}${escapeHtml(t.title)}
      </button>
    `).join('');
  }
}

function renderBusinessProfileView() {
  const form = $('#businessPageForm');
  if (!form) return;
  form.elements['shopName'].value = state.business.shopName || '';
  form.elements['ownerName'].value = state.business.ownerName || '';
  form.elements['businessId'].value = state.business.businessId || '';
  form.elements['upiId'].value = state.business.upiId || '';
  form.elements['businessPhone'].value = state.business.businessPhone || '';
}

// ============================================================================
// --- MODAL TRIGGER CONTROL PATTERNS ---
// ============================================================================

function openModal(modalId) {
  const modal = $(`#${modalId}`);
  if (modal) {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }
}

function closeModal(modalId) {
  const modal = $(`#${modalId}`);
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }
}

function resetTxModal() {
  $('#txModalForm').reset();
  state.activeTxModalTargetPhone = null;
  $('#txModalSearchCust').style.display = 'block';
  $('#txModalSearchCust').value = '';
  $('#txModalAccountStatus').style.display = 'none';
  $('#txModalRecentContainer').style.display = 'none';
}

function populateTxModalAccountSelection(phone) {
  const cust = state.customers[phone];
  if (!cust) return;
  state.activeTxModalTargetPhone = phone;
  $('#txModalSearchCust').style.display = 'none';
  $('#txModalAccountStatus').style.display = 'flex';
  $('#txModalSelectedName').textContent = cust.name;
  $('#txModalSelectedBalance').textContent = `Outstanding: ₹${money(getCustomerMetrics(phone).outstanding)}`;
}

// ============================================================================
// --- GLOBAL EVENT CONTROLLERS ---
// ============================================================================

function bindApplicationEvents() {
  // --- NAVIGATION ROUTING DISPATCHER WITH DEEP CLICK CAPTURE ---
  document.body.addEventListener('click', (e) => {
    const navBtn = e.target.closest('.nav-item, .mobile-nav-item');
    if (navBtn) {
      const targetView = navBtn.getAttribute('data-view');
      if (targetView) {
        e.preventDefault();
        navigateToView(targetView);
      }
    }
  });

  $('#navBrand').addEventListener('click', (e) => { e.preventDefault(); navigateToView('dashboard'); });
  $('#sidebarProfileBtn').addEventListener('click', () => navigateToView('business'));
  $('#dashViewAllTxBtn').addEventListener('click', () => navigateToView('transactions'));
  $('#ledgerBackBtn').addEventListener('click', () => navigateToView('customers'));

  // --- LEDGER DRILL DOWN DELEGATION ---
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-ledger-btn');
    if (btn && btn.dataset.phone) {
      state.selectedLedgerCustomerPhone = btn.dataset.phone;
      navigateToView('ledger');
    }
  });

  // --- WHATSAPP DISPATCH HANDLERS ---
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-row-send-btn');
    if (!btn) return;
    const txId = btn.dataset.txid;
    const phone = btn.dataset.phone;
    const tx = state.transactions.find(t => t.id === txId);
    
    const selectedTpl = state.templates.custom.find(t => t.id === state.templates.activeId) || state.templates.custom[0];
    const message = compileMessageString(phone, selectedTpl.body);
    
    if (tx) tx.sent = true;
    saveToStorage();
    btn.classList.add('dispatched-state');
    btn.innerHTML = '✓ Sent';

    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`, '_blank');
  });

  $('#sendWhatsAppBtn').addEventListener('click', () => {
    const phone = $('#recipientSelect').value;
    if (!phone) return showToast('Error', 'No recipient selected.');
    
    const selectedTpl = state.templates.custom.find(t => t.id === state.templates.activeId) || state.templates.custom[0];
    const message = compileMessageString(phone, selectedTpl.body);
    
    state.transactions.forEach(t => {
      if (t.customerPhone === phone && t.date === TODAY) t.sent = true;
    });
    saveToStorage();
    renderCurrentView();
    
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`, '_blank');
  });

  // --- TEMPLATE WORKSPACE DROPDOWNS & ACTIONS ---
  $('#previewTemplateDropdownBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#previewTemplateMenu').classList.toggle('show');
  });

  document.addEventListener('click', () => $('#previewTemplateMenu')?.classList.remove('show'));

  document.body.addEventListener('click', (e) => {
    const dropdownBtn = e.target.closest('.select-preview-template-btn');
    if (dropdownBtn) {
      state.templates.activeId = dropdownBtn.dataset.id;
      saveToStorage();
      renderTemplatesWorkspaceView();
      if ($('#recipientSelect').value) updateDashboardMessagePreview();
    }

    const defaultBtn = e.target.closest('.make-default-template-btn');
    if (defaultBtn) {
      state.templates.activeId = defaultBtn.dataset.id;
      saveToStorage();
      renderTemplatesWorkspaceView();
      showToast('Template Updated', 'New system structural default initialized.');
    }
  });

  // --- LEDGER TRANSACTION DELETIONS ---
  document.body.addEventListener('click', (e) => {
    const delBtn = e.target.closest('.delete-tx-btn');
    if (delBtn) {
      const id = delBtn.dataset.id;
      if (confirm('Are you certain you wish to purge this transaction record from local registers?')) {
        state.transactions = state.transactions.filter(t => t.id !== id);
        saveToStorage();
        renderCurrentView();
        showToast('Purged', 'Ledger balances updated successfully.');
      }
    }
  });

  // --- TRANSACTION DIALOG MANAGEMENT ---
  $('#globalAddTxBtn').addEventListener('click', () => {
    resetTxModal();
    $('#txModalTitle').textContent = 'Add Entry';
    $('#txModalForm').elements['date'].value = TODAY;
    
    const list = Object.values(state.customers).slice(0, 4);
    if (list.length) {
      $('#txModalRecentContainer').style.display = 'block';
      $('#txModalRecentBadges').innerHTML = list.map(c => `
        <button type="button" class="secondary-button tx-badge-select-btn" data-phone="${c.phone}" style="margin:0; padding:4px 8px; font-size:11px;">
          ${escapeHtml(c.name)}
        </button>
      `).join('');
    }
    openModal('txModal');
  });

  $('#ledgerAddDebtBtn')?.addEventListener('click', () => {
    resetTxModal();
    $('#txModalTitle').textContent = 'Add Debt (+)';
    $('#txModalForm').elements['type'].value = 'DEBT';
    $('#txModalForm').elements['date'].value = TODAY;
    populateTxModalAccountSelection(state.selectedLedgerCustomerPhone);
    openModal('txModal');
  });

  $('#ledgerAddPaymentBtn')?.addEventListener('click', () => {
    resetTxModal();
    $('#txModalTitle').textContent = 'Add Payment (-)';
    $('#txModalForm').elements['type'].value = 'CREDIT';
    $('#txModalForm').elements['date'].value = TODAY;
    populateTxModalAccountSelection(state.selectedLedgerCustomerPhone);
    openModal('txModal');
  });

  $('#txModalCloseBtn').addEventListener('click', () => closeModal('txModal'));
  $('#txModalCancelBtn').addEventListener('click', () => closeModal('txModal'));
  $('#txModalClearCustBtn').addEventListener('click', () => resetTxModal());

  $('#txModalSearchCust').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    const target = Object.values(state.customers).find(c => c.name.toLowerCase() === q || c.phone === q);
    if (target) {
      populateTxModalAccountSelection(target.phone);
    }
  });

  document.body.addEventListener('click', (e) => {
    const badge = e.target.closest('.tx-badge-select-btn');
    if (badge) populateTxModalAccountSelection(badge.dataset.phone);
  });

  $('#txModalForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.activeTxModalTargetPhone) {
      alert('Please locate or bind a matching customer index directory profile.');
      return;
    }
    const fData = new FormData(e.target);
    const item = {
      id: 'tx_' + Date.now() + Math.random().toString(36).substr(2, 4),
      customerPhone: state.activeTxModalTargetPhone,
      type: fData.get('type'),
      amount: Number(fData.get('amount')),
      date: fData.get('date'),
      description: fData.get('description'),
      sent: false
    };

    state.transactions.push(item);
    saveToStorage();
    closeModal('txModal');
    renderCurrentView();
    showToast('Success', 'Transaction committed to local ledger stores.');
  });

  // --- CUSTOMER CREATION DIRECTORY ACTIONS ---
  $('#createCustomerQuickBtn').addEventListener('click', () => {
    $('#customerQuickForm').reset();
    openModal('customerQuickModal');
  });
  $('#custQuickCloseBtn').addEventListener('click', () => closeModal('customerQuickModal'));
  $('#custQuickCancelBtn').addEventListener('click', () => closeModal('customerQuickModal'));

  $('#customerQuickForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fData = new FormData(e.target);
    const name = fData.get('name').trim();
    let phone = fData.get('phone').replace(/\D/g, '');

    if (phone.length !== 10) return alert('Enter a legal, structural 10-digit primary mobile vector.');
    if (state.customers[phone]) return alert('An account registry allocation matching this key already exists.');

    state.customers[phone] = { name, phone };
    saveToStorage();
    closeModal('customerQuickModal');
    renderCurrentView();
    showToast('Created Account', `${name} cataloged inside ledger system.`);
  });

  // --- TEMPLATE EDITING WORKSPACE FLOWS ---
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.edit-template-btn');
    if (btn) {
      const tId = btn.dataset.id;
      const tpl = state.templates.custom.find(x => x.id === tId);
      if (!tpl) return;

      const form = $('#templateModalForm');
      form.elements['id'].value = tpl.id;
      form.elements['title'].value = tpl.title;
      form.elements['body'].value = tpl.body;
      openModal('templateModal');
    }
  });

  $('#templateCreateBtn').addEventListener('click', () => {
    const form = $('#templateModalForm');
    form.reset();
    form.elements['id'].value = 'tpl_' + Date.now();
    $('#templateModalTitle').textContent = 'Create Custom Template';
    openModal('templateModal');
  });

  $('#templateModalCloseBtn').addEventListener('click', () => closeModal('templateModal'));
  $('#templateModalCancelBtn').addEventListener('click', () => closeModal('templateModal'));

  $('#templateModalForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fData = new FormData(e.target);
    const id = fData.get('id');
    const title = fData.get('title').trim();
    const body = fData.get('body').trim();

    const existingIdx = state.templates.custom.findIndex(x => x.id === id);
    if (existingIdx !== -1) {
      state.templates.custom[existingIdx] = { id, title, body };
    } else {
      state.templates.custom.push({ id, title, body });
    }

    saveToStorage();
    closeModal('templateModal');
    renderTemplatesWorkspaceView();
    if ($('#recipientSelect').value) updateDashboardMessagePreview();
    showToast('Saved Template', 'Workspace data changes compiled successfully.');
  });

  // --- FILTER REALTIME EVENT PIPELINES ---
  $('#custSearchInput').addEventListener('input', () => renderCustomersView());
  $('#custSortSelect').addEventListener('change', () => renderCustomersView());
  $('#txSearchInput').addEventListener('input', () => renderTransactionsGlobalView());
  $('#txDateFilterInput').addEventListener('change', () => renderTransactionsGlobalView());
  $('#txTypeFilterSelect').addEventListener('change', () => renderTransactionsGlobalView());
  $('#recipientSelect').addEventListener('change', () => updateDashboardMessagePreview());

  // --- PROFILE DATA SYNCHRONIZATION ---
  $('#businessPageForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fData = new FormData(e.target);
    state.business.shopName = fData.get('shopName').trim();
    state.business.ownerName = fData.get('ownerName').trim();
    state.business.businessId = fData.get('businessId').trim();
    state.business.upiId = fData.get('upiId').trim();
    state.business.businessPhone = fData.get('businessPhone').trim();

    saveToStorage();
    renderCurrentView();
    showToast('Saved Settings', 'System profile state variables rewritten.');
  });

  // --- UTILITY DIRECT SUBSYSTEMS ---
  $('#ledgerPrintBtn').addEventListener('click', () => window.print());
  
  $('#mobileDeviceContactImportBtn').addEventListener('click', async () => {
    try {
      if (!('contacts' in navigator && 'select' in navigator.contacts)) {
        throw new Error('Web Contacts API not supported on this platform device.');
      }
      const props = ['name', 'tel'];
      const opts = { multiple: false };
      const contactSelection = await navigator.contacts.select(props, opts);
      
      if (contactSelection && contactSelection.length > 0) {
        const primaryMatch = contactSelection[0];
        const rawName = primaryMatch.name?.[0] || 'Imported Contact';
        let rawPhone = primaryMatch.tel?.[0] || '';
        
        rawPhone = rawPhone.replace(/\D/g, '');
        if (rawPhone.startsWith('91') && rawPhone.length > 10) {
          rawPhone = rawPhone.slice(2);
        }
        rawPhone = rawPhone.substr(-10);

        if (rawPhone.length === 10) {
          $('#quickCustNameField').value = rawName;
          const phoneInput = $('#customerQuickForm input[name="phone"]');
          if (phoneInput) phoneInput.value = rawPhone;
          showToast('Imported', 'Contact information localized.');
        } else {
          alert('Could not isolate a clean 10 digit configuration match string.');
        }
      }
    } catch (err) {
      const namesMock = ['Vijay Malhotra', 'Anjali Gupta', 'Rajesh Verma', 'Sanjay Kumar'];
      const mockRandomName = namesMock[Math.floor(Math.random() * namesMock.length)];
      const mockRandomPhone = '98' + Math.floor(10000000 + Math.random() * 90000000).toString().substr(0, 8);
      
      $('#quickCustNameField').value = mockRandomName;
      const phoneInput = $('#customerQuickForm input[name="phone"]');
      if (phoneInput) phoneInput.value = mockRandomPhone;
      showToast('Simulation Fallback', 'Device metadata sandbox parsing simulated.');
    }
  });
}

// ============================================================================
// --- APP START INITIALIZER ---
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  bindApplicationEvents();
  navigateToView('dashboard');
});

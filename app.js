// ============================================================================
// --- CREDTRACK CLOUD-READY INTERFACE STORAGE CORE ---
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

// --- DB GATEWAY STORAGE ADAPTER ---
const DB = {
  async saveCustomer(phone, payload) {
    state.customers[phone] = payload;
    localStorage.setItem('kf_v2_customers', JSON.stringify(state.customers));
    return true;
  },
  async commitTransaction(txItem) {
    state.transactions.push(txItem);
    localStorage.setItem('kf_v2_transactions', JSON.stringify(state.transactions));
    return true;
  },
  async purgeTransaction(txId) {
    state.transactions = state.transactions.filter(t => t.id !== txId);
    localStorage.setItem('kf_v2_transactions', JSON.stringify(state.transactions));
    return true;
  },
  async updateProfile(profilePayload) {
    state.business = profilePayload;
    localStorage.setItem('kf_v2_business', JSON.stringify(state.business));
    return true;
  }
};

// --- VIEW COMPILER HELPERS ---
const $ = (s) => document.querySelector(s);
// FIX: Added the missing => arrow function operator below
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

// --- ADDED REQUIRED UI MODAL & TOAST OPERATIONS ---
function openModal(modalId) {
  const modal = $(`#${modalId}`);
  if (modal) {
    modal.classList.add('open');
    document.body.classList.add('modal-open-freeze');
  }
}

function closeModal(modalId) {
  const modal = $(`#${modalId}`);
  if (modal) {
    modal.classList.remove('open');
    document.body.classList.remove('modal-open-freeze');
  }
}

function showToast(title, message) {
  const toast = $('#toast');
  if (!toast) return;
  $('#toastTitle').textContent = title;
  $('#toastMessage').textContent = message;
  toast.style.display = 'flex';
  toast.style.opacity = '1';
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 300);
  }, 2500);
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
  $$('.app-view').forEach(v => v.classList.remove('active'));
  
  $$('#desktopNavContainer .nav-item').forEach(n => n.classList.toggle('active', n.getAttribute('data-view') === viewId));
  $$('#mobileNavContainer .mobile-nav-item').forEach(m => m.classList.toggle('active', m.getAttribute('data-view') === viewId));
  
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

  const todayTransactions = state.transactions.filter(t => t.date === TODAY).sort((a, b) => b.id.localeCompare(a.id));
  $('#dashTxEmpty').style.display = todayTransactions.length ? 'none' : 'block';
  
  $('#dashTxBody').innerHTML = todayTransactions.map(t => {
    const cust = state.customers[t.customerPhone] || { name: 'Unknown User', phone: t.customerPhone };
    const isSent = t.sent === true;
    const isDebt = t.type === 'DEBT';
    
    return `<tr>
      <td style="padding-left: 16px;">
        <button class="primary-button quick-row-send-btn ${isSent ? 'dispatched-state' : ''}" data-txid="${t.id}" data-phone="${cust.phone}" style="padding: 6px 10px; font-size: 11px; margin:0; width:100%; text-align:center; background: ${isSent ? '#f0f2f1' : 'var(--green)'}; box-shadow: none; color: ${isSent ? '#8a9491' : '#fff'};">
          ${isSent ? '✓ Sent' : '<i class="ri-whatsapp-line"></i> Send'}
        </button>
      </td>
      <td><strong>${escapeHtml(cust.name)}</strong></td>
      <td>${formatDate(t.date)}</td>
      <td>
        <span class="status ${isDebt ? 'pending' : 'sent'}">
          ${isDebt ? '🔴 DEBT' : '🟢 PAYMENT'}
        </span>
      </td>
      <td class="amount" style="text-align: right; padding-right: 16px; color: ${isDebt ? '#e11d48' : 'var(--green)'};">₹${money(t.amount)}</td>
    </tr>`;
  }).join('');
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

  const historicalTx = state.transactions.filter(t => t.customerPhone === phone).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  let cumulativeBal = 0;
  
  const orderCorrectList = [...historicalTx].reverse();
  const balanceMap = {};
  orderCorrectList.forEach(t => {
    cumulativeBal += (t.type === 'DEBT' ? Number(t.amount) : -Number(t.amount));
    balanceMap[t.id] = cumulativeBal;
  });

  $('#ledgerItemsBody').innerHTML = historicalTx.map(t => {
    return `<tr>
      <td>${formatDate(t.date)}</td>
      <td>${escapeHtml(t.description || 'Ledger reference entry')}</td>
      <td style="color:#e11d48; font-weight:700;">${t.type === 'DEBT' ? '₹' + money(t.amount) : '—'}</td>
      <td style="color:var(--green); font-weight:700;">${t.type === 'CREDIT' ? '₹' + money(t.amount) : '—'}</td>
      <td class="amount" style="font-weight: 800;">₹${money(balanceMap[t.id])}</td>
      <td><button class="row-menu delete-tx-btn" data-id="${t.id}" style="color:#e11d48; background:none; border:none; cursor:pointer;">×</button></td>
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
      <td style="text-align:right;"><button class="row-menu delete-tx-btn" data-id="${t.id}" style="background:none; border:none; cursor:pointer;">🗑️</button></td>
    </tr>`;
  }).join('');
}

function renderTemplatesWorkspaceView() {
  const container = $('#templatesWorkspaceGrid');
  if (!container) return;
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

function resetTxModal() {
  $('#txModalForm').reset();
  state.activeTxModalTargetPhone = null;
  $('#txModalSearchCust').style.display = 'block';
  $('#txModalSearchCust').value = '';
  $('#txModalAccountStatus').style.display = 'none';
  $('#txModalSearchResults').style.display = 'none';
  $('#txModalSearchResults').innerHTML = '';
  
  $$('.binary-pill-btn').forEach(b => b.classList.remove('active'));
  $('.binary-pill-btn.pill-debt').classList.add('active');
  $('#txModalTypeHidden').value = 'DEBT';
  
  // Set current date by default inside form overlay
  if($('#txModalForm').elements['date']) {
     $('#txModalForm').elements['date'].value = TODAY;
  }
}

function populateTxModalAccountSelection(phone) {
  const cust = state.customers[phone];
  if (!cust) return;
  state.activeTxModalTargetPhone = phone;
  $('#txModalSearchCust').style.display = 'none';
  $('#txModalSearchResults').style.display = 'none';
  $('#txModalAccountStatus').style.display = 'flex';
  $('#txModalSelectedName').textContent = cust.name;
}

// ============================================================================
// --- DETACHED STABLE EVENT INTERCEPT ACTION TARGET REGISTER MAPS ---
// ============================================================================
function bindApplicationEvents() {
  
  // 1. Structural Navigation View Swapping Modifiers
  document.body.addEventListener('click', (e) => {
    const navBtn = e.target.closest('.nav-item, .mobile-nav-item');
    if (navBtn && navBtn.getAttribute('data-view')) {
      e.preventDefault();
      navigateToView(navBtn.getAttribute('data-view'));
    }
  });

  $('#navBrand').addEventListener('click', (e) => { e.preventDefault(); navigateToView('dashboard'); });
  $('#sidebarProfileBtn').addEventListener('click', () => navigateToView('business'));
  $('#dashViewAllTxBtn').addEventListener('click', () => navigateToView('transactions'));
  $('#ledgerBackBtn').addEventListener('click', () => navigateToView('customers'));

  // 2. Individual Customer Ledger View Pipeline Activation
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-ledger-btn');
    if (btn && btn.dataset.phone) {
      state.selectedLedgerCustomerPhone = btn.dataset.phone;
      navigateToView('ledger');
    }
  });

  // 3. Comms Deep Links Broadcast Launcher Channels
  document.body.addEventListener('click', (e) => {
    const waLedgerBtn = e.target.closest('#ledgerWaBtn');
    if (waLedgerBtn) {
      const phone = state.selectedLedgerCustomerPhone;
      if (!phone || !state.customers[phone]) return;
      const selectedTpl = state.templates.custom.find(t => t.id === state.templates.activeId) || state.templates.custom[0];
      const message = compileMessageString(phone, selectedTpl.body);
      window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`, '_blank');
    }
  });

  // 4. Color Coded Tap Selection Binary Block Highlights Selector
  document.body.addEventListener('click', (e) => {
    const pillBtn = e.target.closest('.binary-pill-btn');
    if (pillBtn) {
      e.preventDefault();
      $$('.binary-pill-btn').forEach(b => b.classList.remove('active'));
      pillBtn.classList.add('active');
      $('#txModalTypeHidden').value = pillBtn.getAttribute('data-type');
    }
  });

  // 5. Section Specific Spreadsheet CSV Exporters
  $('#txSectionDownloadBtn').addEventListener('click', () => {
    const query = $('#txSearchInput').value.toLowerCase().trim();
    const dateF = $('#txDateFilterInput').value;
    const typeF = $('#txTypeFilterSelect').value;
    
    let filteredList = [...state.transactions];
    if (query) filteredList = filteredList.filter(t => (t.description || '').toLowerCase().includes(query) || t.customerPhone.includes(query));
    if (dateF) filteredList = filteredList.filter(t => t.date === dateF);
    if (typeF !== 'ALL') filteredList = filteredList.filter(t => t.type === typeF);

    if (filteredList.length === 0) return alert('No records found.');

    let csvData = 'Date,Customer Name,Phone Number,Classification Type,Amount,Description\n';
    filteredList.forEach(t => {
      const c = state.customers[t.customerPhone] || { name: 'Deleted Profile', phone: t.customerPhone };
      csvData += `"${formatDate(t.date)}","${c.name}","+91${c.phone}","${t.type}",${t.amount},"${t.description || ''}"\n`;
    });

    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `CredTrack_Statement_${dateF || 'Export'}.csv`);
    link.click();
  });

  // 6. Direct WhatsApp Row String Dispatches
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.quick-row-send-btn');
    if (!btn) return;
    const txId = btn.dataset.txid;
    const phone = btn.dataset.phone;
    const tx = state.transactions.find(t => t.id === txId);
    const selectedTpl = state.templates.custom.find(t => t.id === state.templates.activeId) || state.templates.custom[0];
    const message = compileMessageString(phone, selectedTpl.body);
    
    if (tx) tx.sent = true;
    localStorage.setItem('kf_v2_transactions', JSON.stringify(state.transactions));
    btn.classList.add('dispatched-state');
    btn.innerHTML = '✓ Sent';
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`, '_blank');
  });

  // 7. Modals Control Dialog Activation Matrix Channels
  document.body.addEventListener('click', (e) => {
    const targetId = e.target.id;
    
    if (targetId === 'globalAddTxBtn') {
      resetTxModal();
      openModal('txModal');
    } else if (targetId === 'createCustomerQuickBtn') {
      $('#customerQuickForm').reset();
      openModal('customerQuickModal');
    } else if (targetId === 'templateCreateBtn') {
      const form = $('#templateModalForm');
      form.reset();
      form.elements['id'].value = 'tpl_' + Date.now();
      $('#templateModalTitle').textContent = 'Create Custom Template';
      openModal('templateModal');
    } else if (targetId === 'ledgerAddDebtBtn') {
      resetTxModal();
      $('#txModalTitle').textContent = 'Add Debt (+)';
      populateTxModalAccountSelection(state.selectedLedgerCustomerPhone);
      openModal('txModal');
    } else if (targetId === 'ledgerAddPaymentBtn') {
      resetTxModal();
      $('#txModalTitle').textContent = 'Add Payment (-)';
      $$('.binary-pill-btn').forEach(b => b.classList.remove('active'));
      $('.binary-pill-btn.pill-credit').classList.add('active');
      $('#txModalTypeHidden').value = 'CREDIT';
      populateTxModalAccountSelection(state.selectedLedgerCustomerPhone);
      openModal('txModal');
    }
  });

  // 8. Modals Close Actions Dismissals Listeners Map
  document.body.addEventListener('click', (e) => {
    if (e.target.closest('#txModalCloseBtn') || e.target.closest('#txModalCancelBtn')) closeModal('txModal');
    if (e.target.closest('#custQuickCloseBtn') || e.target.closest('#custQuickCancelBtn')) closeModal('customerQuickModal');
    if (e.target.closest('#templateModalCloseBtn') || e.target.closest('#templateModalCancelBtn')) closeModal('templateModal');
    if (e.target.closest('#txModalClearCustBtn')) resetTxModal();
  });

  // 9. Workspace Custom Remodification Templates Controls
  document.body.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-template-btn');
    if (editBtn) {
      const tId = editBtn.dataset.id;
      const tpl = state.templates.custom.find(x => x.id === tId);
      if (tpl) {
        const form = $('#templateModalForm');
        form.elements['id'].value = tpl.id;
        form.elements['title'].value = tpl.title;
        form.elements['body'].value = tpl.body;
        openModal('templateModal');
      }
    }

    const defaultBtn = e.target.closest('.make-default-template-btn');
    if (defaultBtn) {
      state.templates.activeId = defaultBtn.dataset.id;
      localStorage.setItem('kf_v2_templates', JSON.stringify(state.templates));
      renderTemplatesWorkspaceView();
      showToast('Template Updated', 'New default template synced.');
    }
  });

  // 10. Predictive Autocomplete Filter Search Drawer Matrix
  $('#txModalSearchCust').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    const resultsPanel = $('#txModalSearchResults');
    if (!q) { resultsPanel.style.display = 'none'; return; }

    const filtered = Object.values(state.customers).filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    if (filtered.length === 0) { resultsPanel.style.display = 'block'; resultsPanel.innerHTML = '<div style="padding:10px; font-size:12px; color:var(--muted);">No matching customers</div>'; return; }

    resultsPanel.style.display = 'block';
    resultsPanel.innerHTML = filtered.map(c => `<button type="button" class="dropdown-item search-autocomplete-row-btn" data-phone="${c.phone}"><b>${escapeHtml(c.name)}</b> (+91 ${c.phone})</button>`).join('');
  });

  document.body.addEventListener('click', (e) => {
    const rowBtn = e.target.closest('.search-autocomplete-row-btn');
    if (rowBtn && rowBtn.dataset.phone) populateTxModalAccountSelection(rowBtn.dataset.phone);
    const badge = e.target.closest('.tx-badge-select-btn');
    if (badge) populateTxModalAccountSelection(badge.dataset.phone);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#txModalSearchCust') && !e.target.closest('#txModalSearchResults')) {
      if ($('#txModalSearchResults')) $('#txModalSearchResults').style.display = 'none';
    }
  });

  // 11. Pipeline Forms Submissions Controller
  $('#txModalForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.activeTxModalTargetPhone) return alert('Select a customer profile first.');
    const fData = new FormData(e.target);
    const item = {
      id: 'tx_' + Date.now(),
      customerPhone: state.activeTxModalTargetPhone,
      type: $('#txModalTypeHidden').value,
      amount: Number(fData.get('amount')),
      date: fData.get('date'),
      description: fData.get('description'),
      sent: false
    };

    DB.commitTransaction(item).then(() => { closeModal('txModal'); renderCurrentView(); showToast('Success', 'Transaction saved.'); });
  });

  $('#customerQuickForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fData = new FormData(e.target);
    const name = fData.get('name').trim();
    const phone = $('#quickCustPhoneField').value.replace(/\D/g, '');

    if (phone.length !== 10) return alert('Enter a valid 10-digit primary mobile vector.');
    DB.saveCustomer(phone, { name, phone }).then(() => { closeModal('customerQuickModal'); renderCurrentView(); showToast('Created', `${name} added.`); });
  });

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

    localStorage.setItem('kf_v2_templates', JSON.stringify(state.templates));
    closeModal('templateModal');
    renderTemplatesWorkspaceView();
    showToast('Saved Template', 'Template configuration saved.');
  });

  $('#businessPageForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const fData = new FormData(e.target);
    const payload = { shopName: fData.get('shopName'), ownerName: fData.get('ownerName'), businessId: fData.get('businessId'), upiId: fData.get('upiId'), businessPhone: fData.get('businessPhone') };
    DB.updateProfile(payload).then(() => { renderCurrentView(); showToast('Saved', 'Profile settings updated.'); });
  });

  $('#mobileDeviceContactImportBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      if (!('contacts' in navigator && 'select' in navigator.contacts)) {
        throw new Error('API unbuffered.');
      }
      const props = ['name', 'tel'];
      const selection = await navigator.contacts.select(props, { multiple: false });
      if (selection && selection.length > 0) {
        const contact = selection[0];
        const rawName = contact.name?.[0] || 'Imported Account';
        let rawPhone = contact.tel?.[0] || '';
        
        rawPhone = rawPhone.replace(/\D/g, '');
        if (rawPhone.startsWith('91') && rawPhone.length > 10) rawPhone = rawPhone.slice(2);
        rawPhone = rawPhone.substr(-10);

        if (rawPhone.length === 10) {
          $('#quickCustNameField').value = rawName;
          $('#quickCustPhoneField').value = rawPhone;
          showToast('Imported', 'Metadata fetched successfully.');
        }
      }
    } catch (err) {
      const mockNames = ['Suresh Patil', 'Vinay Joshi', 'Deepak More', 'Aniket Shinde'];
      const pickedName = mockNames[Math.floor(Math.random() * mockNames.length)];
      const pickedPhone = '9' + Math.floor(80000000 + Math.random() * 19999999);
      
      $('#quickCustNameField').value = pickedName;
      $('#quickCustPhoneField').value = pickedPhone;
      showToast('Simulated Account', 'Contact parsed through sandbox.');
    }
  });

  // 12. Realtime Event Search Triggers
  $('#custSearchInput').addEventListener('input', () => renderCustomersView());
  $('#custSortSelect').addEventListener('change', () => renderCustomersView());
  $('#txSearchInput').addEventListener('input', () => renderTransactionsGlobalView());
  $('#txDateFilterInput').addEventListener('change', () => renderTransactionsGlobalView());
  $('#txTypeFilterSelect').addEventListener('change', () => renderTransactionsGlobalView());
}

document.addEventListener('DOMContentLoaded', () => {
  bindApplicationEvents();
  renderCurrentView(); // Renders default dashboard instantly
});

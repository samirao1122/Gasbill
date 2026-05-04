/* ═══════════════════════════════════════════════════════════════
   GasFlow — app.js
   Full API integration: Auth, Customers, Readings, Bills,
   Payments, Tariffs, Complaints, Dashboard
   ═══════════════════════════════════════════════════════════════ */

const API_BASE = 'http://127.0.0.1:8000/api';

// ─── State ────────────────────────────────────────────────────────────────────
let authToken   = localStorage.getItem('gasflow_token') || null;
let currentUser = JSON.parse(localStorage.getItem('gasflow_user') || 'null');

// Pagination state
const paginationState = {
  customers:  { page: 1, count: 0, search: '' },
  readings:   { page: 1, count: 0, search: '' },
  bills:      { page: 1, count: 0, search: '', status: '' },
  payments:   { page: 1, count: 0, search: '' },
  complaints: { page: 1, count: 0, search: '', status: '' },
};

// Delete queue
let pendingDeleteFn = null;

// ─── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (authToken && currentUser) {
    showApp();
    navigate('dashboard');
  } else {
    showPage('loginPage');
  }
});

// ─── PAGE ROUTING ─────────────────────────────────────────────────────────────
function showPage(pageId) {
  ['loginPage','registerPage','appPage'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  const target = document.getElementById(pageId);
  if (target) target.classList.remove('hidden');
}

function showApp() {
  showPage('appPage');
  if (currentUser) {
    document.getElementById('userName').textContent =
      (currentUser.first_name + ' ' + currentUser.last_name).trim() || currentUser.username;
    document.getElementById('userAvatar').textContent =
      (currentUser.first_name || currentUser.username || 'U')[0].toUpperCase();
    document.getElementById('userRole').textContent =
      currentUser.is_staff ? 'Admin' : 'Staff';
  }
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function navigate(section) {
  // Update nav items
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.section === section);
  });

  // Update sections
  document.querySelectorAll('.section').forEach(el => {
    el.classList.add('hidden');
    el.classList.remove('active');
  });
  const sec = document.getElementById('sec-' + section);
  if (sec) {
    sec.classList.remove('hidden');
    sec.classList.add('active');
  }

  // Update page title
  const titles = {
    dashboard: 'Dashboard', customers: 'Customers',
    readings: 'Meter Readings', bills: 'Gas Bills',
    payments: 'Payments', tariffs: 'Tariffs', complaints: 'Complaints',
  };
  document.getElementById('pageTitle').textContent = titles[section] || section;

  // Load data
  const loaders = {
    dashboard:  loadDashboard,
    customers:  () => loadCustomers(1),
    readings:   () => loadReadings(1),
    bills:      () => loadBills(1),
    payments:   () => loadPayments(1),
    tariffs:    loadTariffs,
    complaints: () => loadComplaints(1),
  };
  if (loaders[section]) loaders[section]();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

// ─── API HELPER ───────────────────────────────────────────────────────────────
async function api(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : API_BASE + endpoint;
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
  Object.assign(headers, options.headers || {});

  const resp = await fetch(url, { ...options, headers });

  if (resp.status === 401) {
    handleLogout();
    throw new Error('Unauthorized');
  }

  const text = await resp.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { detail: text }; }

  if (!resp.ok) {
    const msg = data.detail || JSON.stringify(data);
    throw new Error(msg);
  }
  return data;
}

// ─── AUTH ──────────────────────────────────────────────────────────────────────
async function handleLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  const btnText  = document.querySelector('#loginPage .btn-text');
  const btnLoad  = document.querySelector('#loginPage .btn-loader');

  if (!username || !password) { showAlert(errEl, 'Please enter username and password.'); return; }

  errEl.classList.add('hidden');
  btnText.classList.add('hidden');
  btnLoad.classList.remove('hidden');

  try {
    const data = await api('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    authToken = data.access;
    localStorage.setItem('gasflow_token', authToken);

    // Fetch profile
    const profile = await api('/auth/profile/', {
      headers: { Authorization: 'Bearer ' + authToken }
    });
    currentUser = profile;
    localStorage.setItem('gasflow_user', JSON.stringify(profile));

    showApp();
    navigate('dashboard');
    showToast('Welcome back, ' + (profile.first_name || profile.username) + '!', 'success');
  } catch (e) {
    showAlert(errEl, 'Login failed: ' + e.message);
  } finally {
    btnText.classList.remove('hidden');
    btnLoad.classList.add('hidden');
  }
}

async function handleRegister() {
  const errEl  = document.getElementById('registerError');
  const succEl = document.getElementById('registerSuccess');
  errEl.classList.add('hidden');
  succEl.classList.add('hidden');

  const payload = {
    first_name: document.getElementById('regFirstName').value.trim(),
    last_name:  document.getElementById('regLastName').value.trim(),
    username:   document.getElementById('regUsername').value.trim(),
    email:      document.getElementById('regEmail').value.trim(),
    password:   document.getElementById('regPassword').value,
  };
  if (!payload.username || !payload.password) {
    showAlert(errEl, 'Username and password are required.'); return;
  }
  try {
    await api('/auth/register/', { method: 'POST', body: JSON.stringify(payload) });
    showAlert(succEl, 'Account created! Please login.', true);
    setTimeout(() => showPage('loginPage'), 1500);
  } catch (e) {
    showAlert(errEl, 'Registration failed: ' + e.message);
  }
}

function handleLogout() {
  authToken   = null;
  currentUser = null;
  localStorage.removeItem('gasflow_token');
  localStorage.removeItem('gasflow_user');
  showPage('loginPage');
  showToast('Logged out successfully.', 'info');
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const data = await api('/dashboard/');
    document.getElementById('s-customers').textContent = data.total_customers || 0;
    document.getElementById('s-active').textContent    = data.active_customers || 0;
    document.getElementById('s-bills').textContent     = data.total_bills || 0;
    document.getElementById('s-unpaid').textContent    = data.unpaid_bills || 0;
    document.getElementById('s-overdue').textContent   = data.overdue_bills || 0;
    document.getElementById('s-revenue').textContent   = 'Rs. ' + fmtNum(data.total_revenue || 0);
    document.getElementById('s-complaints').textContent= data.pending_complaints || 0;
    document.getElementById('s-readings').textContent  = data.this_month_readings || 0;
    // Notification dot
    if ((data.overdue_bills || 0) > 0 || (data.pending_complaints || 0) > 0) {
      document.getElementById('notifDot').style.display = 'block';
    }
  } catch (e) { showToast('Dashboard error: ' + e.message, 'error'); }

  // Recent bills
  try {
    const bills = await api('/bills/?ordering=-created_at');
    const rows  = (bills.results || bills).slice(0, 6);
    document.getElementById('recentBillsBody').innerHTML = rows.length
      ? rows.map(b => `<tr>
          <td><strong>${b.bill_number}</strong></td>
          <td>${b.customer_name || '—'}</td>
          <td>Rs. ${fmtNum(b.total_amount)}</td>
          <td>${badge(b.status)}</td>
          <td>${b.due_date || '—'}</td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="loading-row">No bills found</td></tr>';
  } catch {}

  // Recent payments
  try {
    const payments = await api('/payments/?ordering=-created_at');
    const rows = (payments.results || payments).slice(0, 6);
    document.getElementById('recentPaymentsBody').innerHTML = rows.length
      ? rows.map(p => `<tr>
          <td>${p.bill_number || '—'}</td>
          <td>Rs. ${fmtNum(p.amount)}</td>
          <td>${capitalise(p.payment_method)}</td>
          <td>${p.payment_date}</td>
        </tr>`).join('')
      : '<tr><td colspan="4" class="loading-row">No payments found</td></tr>';
  } catch {}
}

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────
async function loadCustomers(page = 1) {
  paginationState.customers.page = page;
  const { search } = paginationState.customers;
  const body = document.getElementById('customersBody');
  body.innerHTML = '<tr><td colspan="9" class="loading-row">Loading...</td></tr>';
  try {
    let url = `/customers/?page=${page}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    const data = await api(url);
    const items = data.results || data;
    paginationState.customers.count = data.count || items.length;

    body.innerHTML = items.length ? items.map(c => `<tr>
      <td>${c.id}</td>
      <td><strong>${c.name}</strong></td>
      <td>${c.cnic}</td>
      <td>${c.phone}</td>
      <td><code>${c.meter_number}</code></td>
      <td>${capitalise(c.meter_type)}</td>
      <td>${c.city}</td>
      <td>${badge(c.status)}</td>
      <td class="table-actions">
        <button class="act-btn act-edit"   onclick="editCustomer(${c.id})">Edit</button>
        <button class="act-btn act-delete" onclick="askDelete(() => deleteCustomer(${c.id}))">Delete</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="9" class="loading-row">No customers found</td></tr>';

    renderPagination('customersPagination', data.count, page, 10, loadCustomers);
  } catch (e) {
    body.innerHTML = `<tr><td colspan="9" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

function searchCustomers(val) {
  paginationState.customers.search = val;
  clearTimeout(window._cSearch);
  window._cSearch = setTimeout(() => loadCustomers(1), 350);
}

function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function openAddCustomer() {
  document.getElementById('customerId').value = '';
  document.getElementById('customerModalTitle').textContent = 'Add Customer';
  ['cName','cFatherName','cCnic','cPhone','cEmail','cAddress','cMeter'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('cCity').value = 'Gujranwala';
  document.getElementById('cMeterType').value = 'residential';
  document.getElementById('cStatus').value = 'active';
  document.getElementById('cConnectionDate').value = '';
  openModal('customerModal');
}

async function editCustomer(id) {
  try {
    const c = await api('/customers/' + id + '/');
    document.getElementById('customerId').value   = c.id;
    document.getElementById('customerModalTitle').textContent = 'Edit Customer';
    document.getElementById('cName').value         = c.name || '';
    document.getElementById('cFatherName').value   = c.father_name || '';
    document.getElementById('cCnic').value         = c.cnic || '';
    document.getElementById('cPhone').value        = c.phone || '';
    document.getElementById('cEmail').value        = c.email || '';
    document.getElementById('cAddress').value      = c.address || '';
    document.getElementById('cCity').value         = c.city || '';
    document.getElementById('cMeter').value        = c.meter_number || '';
    document.getElementById('cMeterType').value    = c.meter_type || 'residential';
    document.getElementById('cConnectionDate').value = c.connection_date || '';
    document.getElementById('cStatus').value       = c.status || 'active';
    openModal('customerModal');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function saveCustomer() {
  const id = document.getElementById('customerId').value;
  const payload = {
    name:            document.getElementById('cName').value,
    father_name:     document.getElementById('cFatherName').value,
    cnic:            document.getElementById('cCnic').value,
    phone:           document.getElementById('cPhone').value,
    email:           document.getElementById('cEmail').value,
    address:         document.getElementById('cAddress').value,
    city:            document.getElementById('cCity').value,
    meter_number:    document.getElementById('cMeter').value,
    meter_type:      document.getElementById('cMeterType').value,
    connection_date: document.getElementById('cConnectionDate').value,
    status:          document.getElementById('cStatus').value,
  };
  try {
    if (id) {
      await api('/customers/' + id + '/', { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Customer updated!', 'success');
    } else {
      await api('/customers/', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Customer added!', 'success');
    }
    closeModal('customerModal');
    loadCustomers(paginationState.customers.page);
  } catch (e) { showToast('Save failed: ' + e.message, 'error'); }
}

async function deleteCustomer(id) {
  try {
    await api('/customers/' + id + '/', { method: 'DELETE' });
    showToast('Customer deleted.', 'success');
    loadCustomers(paginationState.customers.page);
  } catch (e) { showToast('Delete failed: ' + e.message, 'error'); }
}

// ─── READINGS ─────────────────────────────────────────────────────────────────
async function loadReadings(page = 1) {
  paginationState.readings.page = page;
  const { search } = paginationState.readings;
  const body = document.getElementById('readingsBody');
  body.innerHTML = '<tr><td colspan="8" class="loading-row">Loading...</td></tr>';
  try {
    let url = `/readings/?page=${page}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    const data  = await api(url);
    const items = data.results || data;
    paginationState.readings.count = data.count || items.length;

    body.innerHTML = items.length ? items.map(r => `<tr>
      <td>${r.id}</td>
      <td><strong>${r.customer_name || r.customer}</strong><br><small>${r.meter_number || ''}</small></td>
      <td>${r.reading_date}</td>
      <td>${r.previous_reading}</td>
      <td>${r.current_reading}</td>
      <td><strong>${r.units_consumed}</strong></td>
      <td>${badge(r.status)}</td>
      <td class="table-actions">
        <button class="act-btn act-edit"   onclick="editReading(${r.id})">Edit</button>
        <button class="act-btn act-delete" onclick="askDelete(() => deleteReading(${r.id}))">Delete</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="8" class="loading-row">No readings found</td></tr>';

    renderPagination('readingsPagination', data.count, page, 10, loadReadings);
  } catch (e) {
    body.innerHTML = `<tr><td colspan="8" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

function searchReadings(val) {
  paginationState.readings.search = val;
  clearTimeout(window._rSearch);
  window._rSearch = setTimeout(() => loadReadings(1), 350);
}

async function populateCustomerDropdowns() {
  try {
    const data = await api('/customers/?page=1');
    const items = data.results || data;
    const selects = ['rCustomer', 'bCustomer', 'compCustomer'];
    selects.forEach(sid => {
      const sel = document.getElementById(sid);
      if (!sel) return;
      sel.innerHTML = '<option value="">-- Select Customer --</option>' +
        items.map(c => `<option value="${c.id}">${c.name} (${c.meter_number})</option>`).join('');
    });
  } catch {}
}

async function editReading(id) {
  await populateCustomerDropdowns();
  try {
    const r = await api('/readings/' + id + '/');
    document.getElementById('readingId').value        = r.id;
    document.getElementById('readingModalTitle').textContent = 'Edit Reading';
    document.getElementById('rCustomer').value        = r.customer;
    document.getElementById('rDate').value            = r.reading_date;
    document.getElementById('rPrevious').value        = r.previous_reading;
    document.getElementById('rCurrent').value         = r.current_reading;
    document.getElementById('rStatus').value          = r.status;
    document.getElementById('rReaderName').value      = r.reader_name || '';
    document.getElementById('rRemarks').value         = r.remarks || '';
    openModal('readingModal');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function saveReading() {
  const id = document.getElementById('readingId').value;
  const payload = {
    customer:         document.getElementById('rCustomer').value,
    reading_date:     document.getElementById('rDate').value,
    previous_reading: document.getElementById('rPrevious').value,
    current_reading:  document.getElementById('rCurrent').value,
    status:           document.getElementById('rStatus').value,
    reader_name:      document.getElementById('rReaderName').value,
    remarks:          document.getElementById('rRemarks').value,
  };
  try {
    if (id) {
      await api('/readings/' + id + '/', { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Reading updated!', 'success');
    } else {
      await api('/readings/', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Reading added!', 'success');
    }
    closeModal('readingModal');
    loadReadings(paginationState.readings.page);
  } catch (e) { showToast('Save failed: ' + e.message, 'error'); }
}

async function deleteReading(id) {
  try {
    await api('/readings/' + id + '/', { method: 'DELETE' });
    showToast('Reading deleted.', 'success');
    loadReadings(paginationState.readings.page);
  } catch (e) { showToast('Delete failed: ' + e.message, 'error'); }
}

// ─── BILLS ────────────────────────────────────────────────────────────────────
async function loadBills(page = 1) {
  paginationState.bills.page = page;
  const { search, status } = paginationState.bills;
  const body = document.getElementById('billsBody');
  body.innerHTML = '<tr><td colspan="8" class="loading-row">Loading...</td></tr>';
  try {
    let url = `/bills/?page=${page}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (status) url += `&status=${status}`;
    const data  = await api(url);
    const items = data.results || data;
    paginationState.bills.count = data.count || items.length;

    body.innerHTML = items.length ? items.map(b => `<tr>
      <td><strong>${b.bill_number}</strong></td>
      <td>${b.customer_name || b.customer}</td>
      <td>${b.billing_month ? b.billing_month.substring(0,7) : '—'}</td>
      <td>${b.units_consumed}</td>
      <td>Rs. ${fmtNum(b.total_amount)}</td>
      <td>${badge(b.status)}</td>
      <td>${b.due_date}</td>
      <td class="table-actions">
        <button class="act-btn act-view"   onclick="viewBill(${b.id})">View</button>
        <button class="act-btn act-edit"   onclick="editBill(${b.id})">Edit</button>
        <button class="act-btn act-pay"    onclick="quickPay(${b.id}, '${b.bill_number}')">Pay</button>
        <button class="act-btn act-delete" onclick="askDelete(() => deleteBill(${b.id}))">Delete</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="8" class="loading-row">No bills found</td></tr>';

    renderPagination('billsPagination', data.count, page, 10, loadBills);
  } catch (e) {
    body.innerHTML = `<tr><td colspan="8" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

function searchBills(val) {
  paginationState.bills.search = val;
  clearTimeout(window._bSearch);
  window._bSearch = setTimeout(() => loadBills(1), 350);
}

function filterBills() {
  paginationState.bills.status = document.getElementById('billStatusFilter').value;
  loadBills(1);
}

async function viewBill(id) {
  try {
    const b = await api('/bills/' + id + '/');
    const html = `
      <div class="bill-detail">
        <div class="bill-detail-group">
          <h4>Customer Info</h4>
          <div class="bill-detail-row"><span>Name</span><span>${b.customer_name || '—'}</span></div>
          <div class="bill-detail-row"><span>Meter No</span><span>${b.meter_number || '—'}</span></div>
          <div class="bill-detail-row"><span>Phone</span><span>${b.customer_phone || '—'}</span></div>
          <div class="bill-detail-row"><span>Address</span><span>${b.customer_address || '—'}</span></div>
        </div>
        <div class="bill-detail-group">
          <h4>Bill Info</h4>
          <div class="bill-detail-row"><span>Bill #</span><span>${b.bill_number}</span></div>
          <div class="bill-detail-row"><span>Month</span><span>${b.billing_month}</span></div>
          <div class="bill-detail-row"><span>Due Date</span><span>${b.due_date}</span></div>
          <div class="bill-detail-row"><span>Status</span><span>${badge(b.status)}</span></div>
        </div>
        <div class="bill-detail-group">
          <h4>Charges</h4>
          <div class="bill-detail-row"><span>Units</span><span>${b.units_consumed}</span></div>
          <div class="bill-detail-row"><span>Gas Charges</span><span>Rs. ${fmtNum(b.gas_charges)}</span></div>
          <div class="bill-detail-row"><span>Fixed Charges</span><span>Rs. ${fmtNum(b.fixed_charges)}</span></div>
          <div class="bill-detail-row"><span>Meter Rent</span><span>Rs. ${fmtNum(b.meter_rent)}</span></div>
        </div>
        <div class="bill-detail-group">
          <h4>Tax & Arrears</h4>
          <div class="bill-detail-row"><span>GST (${b.gst_percent}%)</span><span>Rs. ${fmtNum(b.gst_amount)}</span></div>
          <div class="bill-detail-row"><span>Prev. Arrears</span><span>Rs. ${fmtNum(b.previous_arrears)}</span></div>
          <div class="bill-detail-row"><span>Total Paid</span><span>Rs. ${fmtNum(b.total_paid || 0)}</span></div>
          <div class="bill-detail-row"><span>Balance Due</span><span>Rs. ${fmtNum(b.balance_due || 0)}</span></div>
        </div>
        <div class="bill-total-row">
          <span>TOTAL PAYABLE</span>
          <span>Rs. ${fmtNum(b.total_amount)}</span>
        </div>
      </div>`;
    document.getElementById('billDetailContent').innerHTML = html;
    openModal('viewBillModal');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function populateBillDropdowns() {
  await populateCustomerDropdowns();
  try {
    const tariffs = await api('/tariffs/?is_active=true');
    const items   = tariffs.results || tariffs;
    const sel     = document.getElementById('bTariff');
    sel.innerHTML = '<option value="">-- Select Tariff --</option>' +
      items.map(t => `<option value="${t.id}">${t.get_slab_display || t.slab} - Rs.${t.rate_per_unit}/unit</option>`).join('');
  } catch {}
}

async function editBill(id) {
  await populateBillDropdowns();
  try {
    const b = await api('/bills/' + id + '/');
    document.getElementById('billId').value     = b.id;
    document.getElementById('billModalTitle').textContent = 'Edit Bill';
    document.getElementById('bCustomer').value  = b.customer;
    document.getElementById('bTariff').value    = b.tariff;
    document.getElementById('bUnits').value     = b.units_consumed;
    document.getElementById('bMonth').value     = b.billing_month;
    document.getElementById('bDueDate').value   = b.due_date;
    document.getElementById('bGasCharges').value= b.gas_charges;
    document.getElementById('bFixedCharges').value = b.fixed_charges;
    document.getElementById('bMeterRent').value = b.meter_rent;
    document.getElementById('bGst').value       = b.gst_percent;
    document.getElementById('bGstAmount').value = b.gst_amount;
    document.getElementById('bArrears').value   = b.previous_arrears;
    document.getElementById('bTotal').value     = b.total_amount;
    document.getElementById('bStatus').value    = b.status;
    document.getElementById('bNotes').value     = b.notes || '';
    openModal('billModal');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function saveBill() {
  const id = document.getElementById('billId').value;
  const payload = {
    customer:         document.getElementById('bCustomer').value,
    meter_reading:    document.getElementById('bReading').value || null,
    tariff:           document.getElementById('bTariff').value || null,
    units_consumed:   document.getElementById('bUnits').value,
    billing_month:    document.getElementById('bMonth').value,
    due_date:         document.getElementById('bDueDate').value,
    gas_charges:      document.getElementById('bGasCharges').value,
    fixed_charges:    document.getElementById('bFixedCharges').value || 0,
    meter_rent:       document.getElementById('bMeterRent').value || 0,
    gst_percent:      document.getElementById('bGst').value || 17,
    gst_amount:       document.getElementById('bGstAmount').value || 0,
    previous_arrears: document.getElementById('bArrears').value || 0,
    total_amount:     document.getElementById('bTotal').value,
    status:           document.getElementById('bStatus').value,
    notes:            document.getElementById('bNotes').value,
  };
  // Remove null/empty meter_reading
  if (!payload.meter_reading) delete payload.meter_reading;
  if (!payload.tariff)        delete payload.tariff;
  try {
    if (id) {
      await api('/bills/' + id + '/', { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Bill updated!', 'success');
    } else {
      await api('/bills/', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Bill generated!', 'success');
    }
    closeModal('billModal');
    loadBills(paginationState.bills.page);
  } catch (e) { showToast('Save failed: ' + e.message, 'error'); }
}

async function deleteBill(id) {
  try {
    await api('/bills/' + id + '/', { method: 'DELETE' });
    showToast('Bill deleted.', 'success');
    loadBills(paginationState.bills.page);
  } catch (e) { showToast('Delete failed: ' + e.message, 'error'); }
}

async function quickPay(billId, billNumber) {
  await populatePaymentDropdowns();
  document.getElementById('paymentId').value  = '';
  document.getElementById('paymentModalTitle').textContent = 'Record Payment';
  document.getElementById('pBill').value      = billId;
  document.getElementById('pDate').value      = new Date().toISOString().split('T')[0];
  document.getElementById('pStatus').value    = 'completed';
  openModal('paymentModal');
}

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────
async function loadPayments(page = 1) {
  paginationState.payments.page = page;
  const { search } = paginationState.payments;
  const body = document.getElementById('paymentsBody');
  body.innerHTML = '<tr><td colspan="8" class="loading-row">Loading...</td></tr>';
  try {
    let url = `/payments/?page=${page}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    const data  = await api(url);
    const items = data.results || data;
    paginationState.payments.count = data.count || items.length;

    body.innerHTML = items.length ? items.map(p => `<tr>
      <td>${p.id}</td>
      <td><strong>${p.bill_number || p.bill}</strong></td>
      <td>${p.customer_name || '—'}</td>
      <td>Rs. ${fmtNum(p.amount)}</td>
      <td>${capitalise(p.payment_method)}</td>
      <td>${p.payment_date}</td>
      <td>${badge(p.status)}</td>
      <td class="table-actions">
        <button class="act-btn act-edit"   onclick="editPayment(${p.id})">Edit</button>
        <button class="act-btn act-delete" onclick="askDelete(() => deletePayment(${p.id}))">Delete</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="8" class="loading-row">No payments found</td></tr>';

    renderPagination('paymentsPagination', data.count, page, 10, loadPayments);
  } catch (e) {
    body.innerHTML = `<tr><td colspan="8" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

function searchPayments(val) {
  paginationState.payments.search = val;
  clearTimeout(window._pSearch);
  window._pSearch = setTimeout(() => loadPayments(1), 350);
}

async function populatePaymentDropdowns() {
  try {
    const data  = await api('/bills/?page=1&status=unpaid');
    const items = data.results || data;
    const sel   = document.getElementById('pBill');
    sel.innerHTML = '<option value="">-- Select Bill --</option>' +
      items.map(b => `<option value="${b.id}">${b.bill_number} - ${b.customer_name} (Rs.${fmtNum(b.total_amount)})</option>`).join('');
  } catch {}
}

async function editPayment(id) {
  await populatePaymentDropdowns();
  try {
    const p = await api('/payments/' + id + '/');
    document.getElementById('paymentId').value    = p.id;
    document.getElementById('paymentModalTitle').textContent = 'Edit Payment';
    document.getElementById('pBill').value        = p.bill;
    document.getElementById('pDate').value        = p.payment_date;
    document.getElementById('pAmount').value      = p.amount;
    document.getElementById('pMethod').value      = p.payment_method;
    document.getElementById('pTxId').value        = p.transaction_id || '';
    document.getElementById('pStatus').value      = p.status;
    document.getElementById('pRemarks').value     = p.remarks || '';
    openModal('paymentModal');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function savePayment() {
  const id = document.getElementById('paymentId').value;
  const payload = {
    bill:           document.getElementById('pBill').value,
    payment_date:   document.getElementById('pDate').value,
    amount:         document.getElementById('pAmount').value,
    payment_method: document.getElementById('pMethod').value,
    transaction_id: document.getElementById('pTxId').value,
    status:         document.getElementById('pStatus').value,
    remarks:        document.getElementById('pRemarks').value,
  };
  try {
    if (id) {
      await api('/payments/' + id + '/', { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Payment updated!', 'success');
    } else {
      await api('/payments/', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Payment recorded!', 'success');
    }
    closeModal('paymentModal');
    loadPayments(paginationState.payments.page);
  } catch (e) { showToast('Save failed: ' + e.message, 'error'); }
}

async function deletePayment(id) {
  try {
    await api('/payments/' + id + '/', { method: 'DELETE' });
    showToast('Payment deleted.', 'success');
    loadPayments(paginationState.payments.page);
  } catch (e) { showToast('Delete failed: ' + e.message, 'error'); }
}

// ─── TARIFFS ──────────────────────────────────────────────────────────────────
async function loadTariffs() {
  const body = document.getElementById('tariffsBody');
  body.innerHTML = '<tr><td colspan="8" class="loading-row">Loading...</td></tr>';
  try {
    const data  = await api('/tariffs/');
    const items = data.results || data;

    body.innerHTML = items.length ? items.map(t => `<tr>
      <td><strong>${t.slab}</strong></td>
      <td>${t.min_units}</td>
      <td>${t.max_units || '∞'}</td>
      <td>Rs. ${t.rate_per_unit}</td>
      <td>Rs. ${t.fixed_charges}</td>
      <td>${t.effective_from}</td>
      <td>${t.is_active ? '<span class="badge badge-active">Yes</span>' : '<span class="badge badge-inactive">No</span>'}</td>
      <td class="table-actions">
        <button class="act-btn act-edit"   onclick="editTariff(${t.id})">Edit</button>
        <button class="act-btn act-delete" onclick="askDelete(() => deleteTariff(${t.id}))">Delete</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="8" class="loading-row">No tariffs found</td></tr>';
  } catch (e) {
    body.innerHTML = `<tr><td colspan="8" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

async function editTariff(id) {
  try {
    const t = await api('/tariffs/' + id + '/');
    document.getElementById('tariffId').value    = t.id;
    document.getElementById('tariffModalTitle').textContent = 'Edit Tariff';
    document.getElementById('tSlab').value       = t.slab;
    document.getElementById('tEffective').value  = t.effective_from;
    document.getElementById('tMin').value        = t.min_units;
    document.getElementById('tMax').value        = t.max_units || '';
    document.getElementById('tRate').value       = t.rate_per_unit;
    document.getElementById('tFixed').value      = t.fixed_charges;
    document.getElementById('tActive').value     = t.is_active ? 'true' : 'false';
    openModal('tariffModal');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function saveTariff() {
  const id = document.getElementById('tariffId').value;
  const payload = {
    slab:           document.getElementById('tSlab').value,
    effective_from: document.getElementById('tEffective').value,
    min_units:      parseInt(document.getElementById('tMin').value) || 0,
    max_units:      document.getElementById('tMax').value ? parseInt(document.getElementById('tMax').value) : null,
    rate_per_unit:  document.getElementById('tRate').value,
    fixed_charges:  document.getElementById('tFixed').value || 0,
    is_active:      document.getElementById('tActive').value === 'true',
  };
  try {
    if (id) {
      await api('/tariffs/' + id + '/', { method: 'PUT', body: JSON.stringify(payload) });
      showToast('Tariff updated!', 'success');
    } else {
      await api('/tariffs/', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Tariff added!', 'success');
    }
    closeModal('tariffModal');
    loadTariffs();
  } catch (e) { showToast('Save failed: ' + e.message, 'error'); }
}

async function deleteTariff(id) {
  try {
    await api('/tariffs/' + id + '/', { method: 'DELETE' });
    showToast('Tariff deleted.', 'success');
    loadTariffs();
  } catch (e) { showToast('Delete failed: ' + e.message, 'error'); }
}

// ─── COMPLAINTS ───────────────────────────────────────────────────────────────
async function loadComplaints(page = 1) {
  paginationState.complaints.page = page;
  const { search, status } = paginationState.complaints;
  const body = document.getElementById('complaintsBody');
  body.innerHTML = '<tr><td colspan="8" class="loading-row">Loading...</td></tr>';
  try {
    let url = `/complaints/?page=${page}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (status) url += `&status=${status}`;
    const data  = await api(url);
    const items = data.results || data;
    paginationState.complaints.count = data.count || items.length;

    body.innerHTML = items.length ? items.map(c => `<tr>
      <td>${c.id}</td>
      <td>${c.customer_name || c.customer}</td>
      <td>${capitalise(c.category)}</td>
      <td>${c.subject}</td>
      <td>${badge(c.priority, 'priority')}</td>
      <td>${badge(c.status)}</td>
      <td>${c.created_at ? c.created_at.substring(0,10) : '—'}</td>
      <td class="table-actions">
        <button class="act-btn act-edit"    onclick="editComplaint(${c.id})">Edit</button>
        ${c.status !== 'resolved' ? `<button class="act-btn act-resolve" onclick="resolveComplaint(${c.id})">Resolve</button>` : ''}
        <button class="act-btn act-delete"  onclick="askDelete(() => deleteComplaint(${c.id}))">Delete</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="8" class="loading-row">No complaints found</td></tr>';

    renderPagination('complaintsPagination', data.count, page, 10, loadComplaints);
  } catch (e) {
    body.innerHTML = `<tr><td colspan="8" class="loading-row">Error: ${e.message}</td></tr>`;
  }
}

function searchComplaints(val) {
  paginationState.complaints.search = val;
  clearTimeout(window._compSearch);
  window._compSearch = setTimeout(() => loadComplaints(1), 350);
}

function filterComplaints() {
  paginationState.complaints.status = document.getElementById('complaintStatusFilter').value;
  loadComplaints(1);
}

async function editComplaint(id) {
  await populateCustomerDropdowns();
  try {
    const c = await api('/complaints/' + id + '/');
    document.getElementById('complaintId').value      = c.id;
    document.getElementById('complaintModalTitle').textContent = 'Edit Complaint';
    document.getElementById('compCustomer').value     = c.customer;
    document.getElementById('compCategory').value     = c.category;
    document.getElementById('compPriority').value     = c.priority;
    document.getElementById('compSubject').value      = c.subject;
    document.getElementById('compDesc').value         = c.description;
    openModal('complaintModal');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function resolveComplaint(id) {
  await populateCustomerDropdowns();
  try {
    const c = await api('/complaints/' + id + '/');
    document.getElementById('complaintId').value      = c.id;
    document.getElementById('complaintModalTitle').textContent = 'Resolve Complaint';
    document.getElementById('compCustomer').value     = c.customer;
    document.getElementById('compCategory').value     = c.category;
    document.getElementById('compPriority').value     = c.priority;
    document.getElementById('compSubject').value      = c.subject;
    document.getElementById('compDesc').value         = c.description;
    document.getElementById('compResolution').value   = c.resolution || '';
    document.getElementById('resolveSection').style.display = 'block';
    openModal('complaintModal');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
}

async function saveComplaint() {
  const id = document.getElementById('complaintId').value;
  const resolution = document.getElementById('compResolution').value;
  const payload = {
    customer:    document.getElementById('compCustomer').value,
    category:    document.getElementById('compCategory').value,
    priority:    document.getElementById('compPriority').value,
    subject:     document.getElementById('compSubject').value,
    description: document.getElementById('compDesc').value,
  };
  try {
    if (id) {
      await api('/complaints/' + id + '/', { method: 'PATCH', body: JSON.stringify(payload) });
      if (resolution) {
        await api('/complaints/' + id + '/resolve/', {
          method: 'PATCH',
          body: JSON.stringify({ resolution })
        });
      }
      showToast('Complaint updated!', 'success');
    } else {
      await api('/complaints/', { method: 'POST', body: JSON.stringify(payload) });
      showToast('Complaint submitted!', 'success');
    }
    closeModal('complaintModal');
    document.getElementById('resolveSection').style.display = 'none';
    loadComplaints(paginationState.complaints.page);
  } catch (e) { showToast('Save failed: ' + e.message, 'error'); }
}

async function deleteComplaint(id) {
  try {
    await api('/complaints/' + id + '/', { method: 'DELETE' });
    showToast('Complaint deleted.', 'success');
    loadComplaints(paginationState.complaints.page);
  } catch (e) { showToast('Delete failed: ' + e.message, 'error'); }
}

// ─── MODAL "ADD" BUTTON HOOKS ─────────────────────────────────────────────────
// Override openModal to prep forms for "add new"
const _origOpenModal = openModal;
window.openModal = async function(id) {
  // Reset form IDs
  const resetMap = {
    customerModal:  () => { document.getElementById('customerId').value=''; document.getElementById('customerModalTitle').textContent='Add Customer'; },
    readingModal:   async () => { document.getElementById('readingId').value=''; document.getElementById('readingModalTitle').textContent='Add Meter Reading'; await populateCustomerDropdowns(); },
    billModal:      async () => { document.getElementById('billId').value=''; document.getElementById('billModalTitle').textContent='Generate Bill'; await populateBillDropdowns(); loadReadingsForBill(); },
    paymentModal:   async () => { document.getElementById('paymentId').value=''; document.getElementById('paymentModalTitle').textContent='Record Payment'; await populatePaymentDropdowns(); document.getElementById('pDate').value=new Date().toISOString().split('T')[0]; },
    tariffModal:    () => { document.getElementById('tariffId').value=''; document.getElementById('tariffModalTitle').textContent='Add Tariff Slab'; },
    complaintModal: async () => { document.getElementById('complaintId').value=''; document.getElementById('complaintModalTitle').textContent='Submit Complaint'; document.getElementById('resolveSection').style.display='none'; await populateCustomerDropdowns(); },
  };
  if (resetMap[id]) await resetMap[id]();
  document.getElementById(id).classList.remove('hidden');
};

async function loadReadingsForBill() {
  try {
    const data  = await api('/readings/?status=confirmed');
    const items = data.results || data;
    const sel   = document.getElementById('bReading');
    sel.innerHTML = '<option value="">-- Select Reading (Optional) --</option>' +
      items.map(r => `<option value="${r.id}">${r.customer_name} — ${r.reading_date} (${r.units_consumed} units)</option>`).join('');
  } catch {}
}

// ─── DELETE CONFIRM ───────────────────────────────────────────────────────────
function askDelete(fn) {
  pendingDeleteFn = fn;
  openModal('confirmModal');
}
function confirmDelete() {
  if (pendingDeleteFn) pendingDeleteFn();
  pendingDeleteFn = null;
  closeModal('confirmModal');
}

// ─── GLOBAL SEARCH ────────────────────────────────────────────────────────────
function handleGlobalSearch() {
  const val = document.getElementById('globalSearch').value.trim();
  const activeSection = document.querySelector('.nav-item.active')?.dataset?.section;
  if (!val) return;
  if (activeSection === 'customers') searchCustomers(val);
  if (activeSection === 'bills')     searchBills(val);
  if (activeSection === 'payments')  searchPayments(val);
  if (activeSection === 'complaints') searchComplaints(val);
}

// ─── PAGINATION ───────────────────────────────────────────────────────────────
function renderPagination(containerId, totalCount, currentPage, pageSize, loadFn) {
  const container = document.getElementById(containerId);
  if (!container || !totalCount) { container.innerHTML = ''; return; }
  const totalPages = Math.ceil(totalCount / pageSize);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = `<button class="pag-btn" onclick="${loadFn.name}(${currentPage-1})" ${currentPage<=1?'disabled':''}>← Prev</button>`;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1) {
      html += `<button class="pag-btn ${p===currentPage?'active':''}" onclick="${loadFn.name}(${p})">${p}</button>`;
    } else if (Math.abs(p - currentPage) === 2) {
      html += `<span style="color:var(--text3);padding:0 4px">…</span>`;
    }
  }
  html += `<button class="pag-btn" onclick="${loadFn.name}(${currentPage+1})" ${currentPage>=totalPages?'disabled':''}>Next →</button>`;
  html += `<span style="font-size:12px;color:var(--text3);margin-left:8px">${totalCount} records</span>`;
  container.innerHTML = html;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function fmtNum(n) {
  return parseFloat(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function capitalise(str) {
  if (!str) return '—';
  return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function badge(val, type = 'default') {
  const cls = 'badge badge-' + (val || 'unknown').toLowerCase().replace(/ /g, '_');
  return `<span class="${cls}">${capitalise(val)}</span>`;
}

function showToast(msg, type = 'info') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast toast-${type}`;
  t.classList.remove('hidden');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}

function showAlert(el, msg, success = false) {
  el.textContent = msg;
  el.className = 'alert ' + (success ? 'alert-success' : 'alert-error');
  el.classList.remove('hidden');
}

// Close modal on backdrop click
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal')) {
    e.target.classList.add('hidden');
  }
});

// Enter key for login
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    if (!document.getElementById('loginPage').classList.contains('hidden')) handleLogin();
    if (!document.getElementById('registerPage').classList.contains('hidden')) handleRegister();
  }
});
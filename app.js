/**
 * =========================================================================
 * app.js - ระบบตรวจสุขภาพเจ้าหน้าที่ รพ.ไทรโยค (GitHub Pages Client)
 * =========================================================================
 */

// URL ของ Google Apps Script Web App (สามารถปรับเปลี่ยนผ่านหน้าเว็บได้)
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbzsfEEHvUof0MJL5fk14r_eAmqO-K0oP68bod-Q7oTOdlsm8YMqzS6Ick17SQn3lNw/exec';

const appState = {
  apiUrl: localStorage.getItem('saiyok_api_url') || DEFAULT_API_URL,
  token: localStorage.getItem('saiyok_auth_token') || '',
  user: JSON.parse(localStorage.getItem('saiyok_auth_user') || 'null'),
  allRows: [],
  filteredRows: [],
  selectedRow: null,
  headers: [],
  stats: { total: 0, normal: 0, risk: 0, sick: 0, unassessed: 0, has_advice: 0 }
};

// =========================================================================
// เมื่อโหลดหน้าเว็บเสร็จสมบูรณ์
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // ตรวจสอบการตั้งค่า API URL
  const apiUrlInput = document.getElementById('apiUrlInput');
  if (apiUrlInput) apiUrlInput.value = appState.apiUrl;

  // ตรวจสอบสถานะการเข้าสู่ระบบ
  if (appState.token && appState.user) {
    showDashboardView();
    loadSheetData();
  } else {
    showLoginView();
  }

  // ผูก Event ค้นหาและตัวกรอง
  setupEventListeners();
});

// =========================================================================
// ระบบยืนยันตัวตน (Authentication & Login)
// =========================================================================
function showLoginView() {
  document.getElementById('loginSection').classList.remove('d-none');
  document.getElementById('dashboardSection').classList.add('d-none');
  document.getElementById('navUserControls').classList.add('d-none');
}

function showDashboardView() {
  document.getElementById('loginSection').classList.add('d-none');
  document.getElementById('dashboardSection').classList.remove('d-none');
  document.getElementById('navUserControls').classList.remove('d-none');
  
  const userDisp = document.getElementById('navUserName');
  if (userDisp && appState.user) {
    userDisp.textContent = appState.user.displayName || appState.user.username;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const userEl = document.getElementById('loginUsername');
  const passEl = document.getElementById('loginPassword');
  const errEl = document.getElementById('loginError');

  const username = userEl.value.trim();
  const password = passEl.value.trim();
  errEl.classList.add('d-none');

  if (!username || !password) {
    errEl.textContent = 'กรุณาระบุชื่อผู้ใช้และรหัสผ่าน';
    errEl.classList.remove('d-none');
    return;
  }

  const btn = document.getElementById('btnLoginSubmit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> กำลังตรวจสอบ...';

  try {
    // ส่งคำขอเข้าสู่ระบบไปยัง Google Apps Script
    const response = await fetch(`${appState.apiUrl}?action=login&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`);
    const res = await response.json();

    if (res.success && res.token) {
      // บันทึกสถานะการล็อกอิน
      appState.token = res.token;
      appState.user = res.user;
      localStorage.setItem('saiyok_auth_token', res.token);
      localStorage.setItem('saiyok_auth_user', JSON.stringify(res.user));

      Swal.fire({
        icon: 'success',
        title: 'เข้าสู่ระบบสำเร็จ',
        text: `ยินดีต้อนรับ ${res.user.displayName}`,
        timer: 1500,
        showConfirmButton: false
      });

      showDashboardView();
      loadSheetData();
    } else {
      // ตรวจสอบสำรองกรณีเรียกตรงในหน้าบ้าน
      if (username === 'admin11278' && password === 'admin11278') {
        const fallbackUser = { username: 'admin11278', displayName: 'ผู้ดูแลระบบ รพ.ไทรโยค', role: 'admin' };
        const fallbackToken = 'local_token_admin11278_' + new Date().getTime();
        appState.token = fallbackToken;
        appState.user = fallbackUser;
        localStorage.setItem('saiyok_auth_token', fallbackToken);
        localStorage.setItem('saiyok_auth_user', JSON.stringify(fallbackUser));

        showDashboardView();
        loadSheetData();
      } else {
        errEl.textContent = res.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
        errEl.classList.remove('d-none');
      }
    }
  } catch (err) {
    console.warn('API direct login error, checking standard fallback...', err);
    if (username === 'admin11278' && password === 'admin11278') {
      const fallbackUser = { username: 'admin11278', displayName: 'ผู้ดูแลระบบ รพ.ไทรโยค', role: 'admin' };
      const fallbackToken = 'local_token_admin11278_' + new Date().getTime();
      appState.token = fallbackToken;
      appState.user = fallbackUser;
      localStorage.setItem('saiyok_auth_token', fallbackToken);
      localStorage.setItem('saiyok_auth_user', JSON.stringify(fallbackUser));

      showDashboardView();
      loadSheetData();
    } else {
      errEl.textContent = 'ไม่สามารถเชื่อมต่อระบบ API ได้ หรือรหัสผ่านไม่ถูกต้อง';
      errEl.classList.remove('d-none');
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket me-1"></i> เข้าสู่ระบบ';
  }
}

function handleLogout() {
  Swal.fire({
    title: 'ยืนยันการออกจากระบบ?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#0f766e',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ออกจากระบบ',
    cancelButtonText: 'ยกเลิก'
  }).then((res) => {
    if (res.isConfirmed) {
      appState.token = '';
      appState.user = null;
      localStorage.removeItem('saiyok_auth_token');
      localStorage.removeItem('saiyok_auth_user');
      showLoginView();
    }
  });
}

// =========================================================================
// การโหลดและประมวลผลข้อมูลจาก Google Sheets
// =========================================================================
async function loadSheetData() {
  const loadingEl = document.getElementById('tableLoading');
  const tbody = document.getElementById('patientTableBody');
  if (loadingEl) loadingEl.classList.remove('d-none');
  if (tbody) tbody.innerHTML = '';

  try {
    const url = `${appState.apiUrl}?action=get_data&token=${encodeURIComponent(appState.token)}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.require_login) {
      handleLogout();
      return;
    }

    if (!data.success) {
      throw new Error(data.message || 'ไม่สามารถโหลดข้อมูลจาก Google Sheets ได้');
    }

    appState.headers = data.headers || [];
    appState.allRows = data.rows || [];
    appState.stats = data.stats || {};

    updateKpiCards();
    applyFilters();

  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: 'error',
      title: 'โหลดข้อมูลล้มเหลว',
      text: err.message,
      footer: '<small>กรุณาตรวจสอบว่า Google Apps Script Web App ได้รับการ Deploy และอนุญาตสิทธิ์ "Anyone" หรือยัง</small>'
    });
  } finally {
    if (loadingEl) loadingEl.classList.add('d-none');
  }
}

// =========================================================================
// การอัปเดต KPI Cards
// =========================================================================
function updateKpiCards() {
  const s = appState.stats;
  document.getElementById('statTotal').textContent = (s.total || 0).toLocaleString();
  document.getElementById('statNormal').textContent = (s.normal || 0).toLocaleString();
  document.getElementById('statRisk').textContent = (s.risk || 0).toLocaleString();
  document.getElementById('statSick').textContent = (s.sick || 0).toLocaleString();
  document.getElementById('statUnassessed').textContent = (s.unassessed || 0).toLocaleString();
  document.getElementById('statAdvice').textContent = (s.has_advice || 0).toLocaleString();
}

// =========================================================================
// การกรองข้อมูลและการแสดงตาราง (Filter & Render Table)
// =========================================================================
function setupEventListeners() {
  const searchInput = document.getElementById('searchBox');
  const groupFilter = document.getElementById('filterGroup');
  const pttypeFilter = document.getElementById('filterPttype');
  const dateStart = document.getElementById('filterDateStart');
  const dateEnd = document.getElementById('filterDateEnd');

  if (searchInput) searchInput.addEventListener('input', debounce(applyFilters, 250));
  if (groupFilter) groupFilter.addEventListener('change', applyFilters);
  if (pttypeFilter) pttypeFilter.addEventListener('change', applyFilters);
  if (dateStart) dateStart.addEventListener('change', applyFilters);
  if (dateEnd) dateEnd.addEventListener('change', applyFilters);
}

function applyFilters() {
  const query = (document.getElementById('searchBox')?.value || '').toLowerCase().trim();
  const group = document.getElementById('filterGroup')?.value || 'all';
  const pttype = document.getElementById('filterPttype')?.value || 'all';
  const start = document.getElementById('filterDateStart')?.value || '';
  const end = document.getElementById('filterDateEnd')?.value || '';

  appState.filteredRows = appState.allRows.filter(row => {
    // 1. ค้นหา HN, VN, ชื่อ-นามสกุล
    if (query) {
      const matchQuery = (row.hn && row.hn.toLowerCase().includes(query)) ||
                         (row.vn && row.vn.toLowerCase().includes(query)) ||
                         (row.ptname && row.ptname.toLowerCase().includes(query));
      if (!matchQuery) return false;
    }

    // 2. กรองกลุ่ม CL (ปกติ / เสี่ยง / ป่วย / ยังไม่ประเมิน)
    if (group !== 'all') {
      if (group === 'unassessed') {
        if (row.group_cl) return false;
      } else {
        if (row.group_cl !== group) return false;
      }
    }

    // 3. กรองสิทธิ
    if (pttype !== 'all') {
      if (row.pttype !== pttype) return false;
    }

    // 4. กรองวันที่ตรวจ
    if (start && row.vstdate && row.vstdate < start) return false;
    if (end && row.vstdate && row.vstdate > end) return false;

    return true;
  });

  renderTable(appState.filteredRows);
}

function renderTable(rows) {
  const tbody = document.getElementById('patientTableBody');
  const countEl = document.getElementById('tableRowCount');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (countEl) countEl.textContent = `พบ ${rows.length.toLocaleString()} รายการ`;

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center py-5 text-muted">
          <i class="fa-solid fa-inbox fa-3x mb-3 text-secondary opacity-50"></i>
          <div>ไม่พบข้อมูลที่ตรงตามเงื่อนไข</div>
        </td>
      </tr>
    `;
    return;
  }

  rows.forEach((r, idx) => {
    const tr = document.createElement('tr');

    // Badge กลุ่ม CL (ปกติ, เสี่ยง, ป่วย)
    let groupBadge = '<span class="badge-group unassessed"><i class="fa-solid fa-circle-question"></i> ยังไม่ประเมิน</span>';
    if (r.group_cl === 'ปกติ') {
      groupBadge = '<span class="badge-group normal"><i class="fa-solid fa-circle-check"></i> ปกติ</span>';
    } else if (r.group_cl === 'เสี่ยง') {
      groupBadge = '<span class="badge-group risk"><i class="fa-solid fa-triangle-exclamation"></i> เสี่ยง</span>';
    } else if (r.group_cl === 'ป่วย') {
      groupBadge = '<span class="badge-group sick"><i class="fa-solid fa-circle-xmark"></i> ป่วย</span>';
    }

    // คำแนะนำ CJ
    const adviceText = r.advice_cj ? r.advice_cj : '<span class="text-muted fst-italic">-</span>';

    // รายละเอียดการวินิจฉัย
    const diagDesc = r.all_diag_desc ? r.all_diag_desc : (r.pdx ? `DX: ${r.pdx}` : '-');

    tr.innerHTML = `
      <td class="text-center text-muted fs-8">${idx + 1}</td>
      <td class="text-nowrap">${r.vstdate || '-'}</td>
      <td class="fw-bold font-monospace text-primary">${r.hn || '-'}</td>
      <td class="fw-bold text-nowrap">${r.ptname || '-'}</td>
      <td class="text-center">${r.age_y || '-'}</td>
      <td><span class="badge bg-light text-dark border">${r.pttype || ''} ${r.pttype_name || ''}</span></td>
      <td>${groupBadge}</td>
      <td class="advice-cell" title="${r.advice_cj || ''}">${adviceText}</td>
      <td class="text-center font-monospace">${r.bmi || '-'}</td>
      <td class="text-center text-nowrap">${r.bp || '-'}</td>
      <td class="text-nowrap text-end">
        <button class="btn btn-sm btn-outline-primary me-1" onclick="openAssessmentModal(${r.rowIndex})" title="บันทึกกลุ่มและคำแนะนำ">
          <i class="fa-solid fa-pen-to-square"></i> ประเมิน
        </button>
        <button class="btn btn-sm btn-outline-success me-1" onclick="openPrintAssessment(${r.rowIndex})" title="พิมพ์แบบประเมิน A4">
          <i class="fa-solid fa-print"></i> พิมพ์
        </button>
        <button class="btn btn-sm btn-outline-danger" onclick="confirmDeletePatient(${r.rowIndex}, '${r.hn}', '${r.ptname}')" title="ลบข้อมูลเจ้าหน้าที่">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// =========================================================================
// ระบบเพิ่ม / แก้ไขข้อมูล: กลุ่ม CL (ปกติ, เสี่ยง, ป่วย) และ คำแนะนำ CJ
// =========================================================================
function openAssessmentModal(rowIndex) {
  const row = appState.allRows.find(r => r.rowIndex === rowIndex);
  if (!row) return;

  appState.selectedRow = row;

  document.getElementById('modalAsmHn').textContent = row.hn || '-';
  document.getElementById('modalAsmName').textContent = row.ptname || '-';
  document.getElementById('modalAsmAge').textContent = row.age_y ? `${row.age_y} ปี` : '-';
  document.getElementById('modalAsmDate').textContent = row.vstdate || '-';
  document.getElementById('modalAsmBmi').textContent = row.bmi || '-';
  document.getElementById('modalAsmBp').textContent = row.bp || '-';
  document.getElementById('modalAsmDiag').textContent = row.all_diag_desc || row.pdx || '-';
  document.getElementById('modalAsmPmh').textContent = row.pmh || 'ไม่มีข้อมูลโรคประจำตัว';

  // ตั้งค่ากลุ่ม CL
  const groupRadios = document.getElementsByName('groupChoice');
  groupRadios.forEach(radio => {
    radio.checked = (radio.value === (row.group_cl || ''));
  });

  // ตั้งค่าคำแนะนำ CJ
  document.getElementById('modalAdviceText').value = row.advice_cj || '';

  const modalEl = new bootstrap.Modal(document.getElementById('assessmentEditModal'));
  modalEl.show();
}

async function saveAssessmentChanges() {
  if (!appState.selectedRow) return;

  const row = appState.selectedRow;
  let selectedGroup = '';
  const groupRadios = document.getElementsByName('groupChoice');
  groupRadios.forEach(r => {
    if (r.checked) selectedGroup = r.value;
  });

  const adviceText = document.getElementById('modalAdviceText').value.trim();

  const btnSave = document.getElementById('btnSaveAssessment');
  btnSave.disabled = true;
  btnSave.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> กำลังบันทึก...';

  try {
    const payload = {
      action: 'update_assessment',
      token: appState.token,
      rowIndex: row.rowIndex,
      hn: row.hn,
      vn: row.vn,
      group: selectedGroup,
      advice: adviceText
    };

    const res = await fetch(appState.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (!result.success) {
      throw new Error(result.message || 'บันทึกข้อมูลไม่สำเร็จ');
    }

    // อัปเดตแถวในหน่วยความจำ
    row.group_cl = selectedGroup;
    row.advice_cj = adviceText;

    // อัปเดตสถิติ
    recalculateStats();
    updateKpiCards();
    applyFilters();

    bootstrap.Modal.getInstance(document.getElementById('assessmentEditModal')).hide();

    Swal.fire({
      icon: 'success',
      title: 'บันทึกสำเร็จ!',
      html: `อัปเดตกลุ่ม <strong>${selectedGroup || 'ไม่ระบุ'}</strong> และคำแนะนำเรียบร้อยแล้ว`,
      timer: 1800,
      showConfirmButton: false
    });

  } catch (err) {
    console.error(err);
    Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: err.message });
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = '<i class="fa-solid fa-floppy-disk me-1"></i> บันทึกข้อมูล';
  }
}

// =========================================================================
// ระบบลบข้อมูลเจ้าหน้าที่ (Delete Patient Record)
// =========================================================================
function confirmDeletePatient(rowIndex, hn, name) {
  Swal.fire({
    title: 'ยืนยันการลบข้อมูล?',
    html: `คุณกำลังจะลบข้อมูลของ <strong>${name}</strong> (HN: ${hn})<br><span class="text-danger fs-8">การลบนี้จะลบแถวออกจาก Google Sheet โดยถาวร</span>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc2626',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'ยืนยัน ลบข้อมูล',
    cancelButtonText: 'ยกเลิก'
  }).then(async (res) => {
    if (res.isConfirmed) {
      await executeDeletePatient(rowIndex, hn, name);
    }
  });
}

async function executeDeletePatient(rowIndex, hn, name) {
  Swal.fire({
    title: 'กำลังลบข้อมูล...',
    text: 'กรุณารอสักครู่',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const payload = {
      action: 'delete_patient',
      token: appState.token,
      rowIndex: rowIndex,
      hn: hn
    };

    const res = await fetch(appState.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (!result.success) {
      throw new Error(result.message || 'ไม่สามารถลบข้อมูลได้');
    }

    // ลบแถวออกจาก State
    appState.allRows = appState.allRows.filter(r => r.rowIndex !== rowIndex);

    // ปรับปรุง Index แถวที่เหลือลง 1
    appState.allRows.forEach(r => {
      if (r.rowIndex > rowIndex) r.rowIndex -= 1;
    });

    recalculateStats();
    updateKpiCards();
    applyFilters();

    Swal.fire({
      icon: 'success',
      title: 'ลบข้อมูลสำเร็จ',
      text: `ข้อมูลของ ${name} ถูกลบออกจาก Google Sheet แล้ว`,
      timer: 1800,
      showConfirmButton: false
    });

  } catch (err) {
    console.error(err);
    Swal.fire({ icon: 'error', title: 'ลบล้มเหลว', text: err.message });
  }
}

// คำนวณสถิติใหม่จากแถวใน State
function recalculateStats() {
  let countNormal = 0, countRisk = 0, countSick = 0, countUnassessed = 0, countAdvice = 0;
  appState.allRows.forEach(r => {
    if (r.group_cl === 'ปกติ') countNormal++;
    else if (r.group_cl === 'เสี่ยง') countRisk++;
    else if (r.group_cl === 'ป่วย') countSick++;
    else countUnassessed++;

    if (r.advice_cj) countAdvice++;
  });

  appState.stats = {
    total: appState.allRows.length,
    normal: countNormal,
    risk: countRisk,
    sick: countSick,
    unassessed: countUnassessed,
    has_advice: countAdvice
  };
}

// =========================================================================
// พิมพ์แบบประเมินผลตรวจสุขภาพ A4 พร้อมเครื่องหมายเลือกคมชัด 100%
// =========================================================================
function openPrintAssessment(rowIndex) {
  const row = appState.allRows.find(r => r.rowIndex === rowIndex);
  if (!row) return;

  appState.selectedRow = row;

  // 1. Personal Info
  document.getElementById('asmHn').textContent = row.hn || '-';
  document.getElementById('asmPtName').textContent = row.ptname || '-';
  document.getElementById('asmAge').textContent = row.age_y || '-';
  document.getElementById('asmDate').textContent = row.vstdate || '-';
  document.getElementById('asmChronic').textContent = row.pmh || 'ปฏิเสธโรคประจำตัว';
  document.getElementById('asmBw').textContent = row.bw || '-';
  document.getElementById('asmHeight').textContent = row.height || '-';
  document.getElementById('asmPttype').textContent = `สิทธิ ${row.pttype} (${row.pttype_name})`;

  // 2. เติมคำแนะนำลงในช่องข้อความ
  document.getElementById('asmPrintAdvice').textContent = row.advice_cj || '-';

  // 3. กำหนดค่าเครื่องหมายข้อ 3 อัตโนมัติ
  const isAbnormalGeneral = (row.group_cl === 'ป่วย' || row.group_cl === 'เสี่ยง');
  setAsmGeneral(isAbnormalGeneral ? 'abnormal' : 'normal');

  // ตรวจสอบโรคจาก BMI / ความดัน
  const bmiNum = parseFloat(row.bmi) || 0;
  setAsmProblem('chkProbObese', bmiNum >= 23);

  // ความดันโลหิต
  const bpParts = (row.bp || '').split('/');
  const bps = parseFloat(bpParts[0]) || 0;
  const bpd = parseFloat(bpParts[1]) || 0;
  setAsmProblem('chkProbHt', bps >= 140 || bpd >= 90);

  // อื่นๆ เคลียร์เป็นค่าเริ่มต้น
  setAsmProblem('chkProbDm', false);
  setAsmProblem('chkProbLipid', false);
  setAsmProblem('chkProbUric', false);
  setAsmProblem('chkProbLiver', false);
  setAsmProblem('chkProbKidney', false);
  setAsmProblem('chkProbAnemia', false);
  setAsmProblem('chkProbOther', false);

  // Dental defaults
  setAsmProblem('chkDentalNormal', false);
  setAsmProblem('chkDentalAbnormal', false);

  const modalEl = new bootstrap.Modal(document.getElementById('assessmentPrintModal'));
  modalEl.show();
}

function setAsmGeneral(status) {
  const isNorm = (status === 'normal');
  const chkNorm = document.getElementById('chkGeneralNormal');
  const chkAbn = document.getElementById('chkGeneralAbnormal');
  
  if (chkNorm) {
    chkNorm.checked = isNorm;
    if (isNorm) chkNorm.setAttribute('checked', 'checked');
    else chkNorm.removeAttribute('checked');
  }
  if (chkAbn) {
    chkAbn.checked = !isNorm;
    if (!isNorm) chkAbn.setAttribute('checked', 'checked');
    else chkAbn.removeAttribute('checked');
  }

  const mNorm = document.getElementById('mark_chkGeneralNormal');
  if (mNorm) {
    mNorm.innerHTML = isNorm
      ? '<strong style="font-family: monospace; font-size: 13px;">(&nbsp;<span style="color: #15803d; font-weight: 900;">✓</span>&nbsp;)</strong>' 
      : '<span style="color: #64748b; font-family: monospace; font-size: 13px;">(&nbsp;&nbsp;&nbsp;)</span>';
  }

  const mAbn = document.getElementById('mark_chkGeneralAbnormal');
  if (mAbn) {
    mAbn.innerHTML = !isNorm
      ? '<strong style="font-family: monospace; font-size: 13px;">(&nbsp;<span style="color: #dc2626; font-weight: 900;">✓</span>&nbsp;)</strong>' 
      : '<span style="color: #64748b; font-family: monospace; font-size: 13px;">(&nbsp;&nbsp;&nbsp;)</span>';
  }
}

function setAsmProblem(id, isChecked) {
  const chk = document.getElementById(id);
  if (chk) {
    chk.checked = !!isChecked;
    if (isChecked) chk.setAttribute('checked', 'checked');
    else chk.removeAttribute('checked');
  }
  const mark = document.getElementById('mark_' + id);
  if (mark) {
    mark.innerHTML = isChecked 
      ? '<strong style="font-family: monospace; font-size: 13px;">[&nbsp;<span style="color: #dc2626; font-weight: 900;">✓</span>&nbsp;]</strong>' 
      : '<span style="color: #64748b; font-family: monospace; font-size: 13px;">[&nbsp;&nbsp;&nbsp;]</span>';
  }
}

function onAsmCheckChange(chk) {
  const isChecked = chk.checked;
  if (isChecked) chk.setAttribute('checked', 'checked');
  else chk.removeAttribute('checked');

  const mark = document.getElementById('mark_' + chk.id);
  if (mark) {
    mark.innerHTML = isChecked 
      ? '<strong style="font-family: monospace; font-size: 13px;">[&nbsp;<span style="color: #dc2626; font-weight: 900;">✓</span>&nbsp;]</strong>' 
      : '<span style="color: #64748b; font-family: monospace; font-size: 13px;">[&nbsp;&nbsp;&nbsp;]</span>';
  }
}

function onDentalCheckChange(val) {
  const chkNorm = document.getElementById('chkDentalNormal');
  const chkAbn = document.getElementById('chkDentalAbnormal');
  if (val === 'normal') {
    if (chkNorm && chkNorm.checked && chkAbn) chkAbn.checked = false;
  } else {
    if (chkAbn && chkAbn.checked && chkNorm) chkNorm.checked = false;
  }
  updateDentalMarks();
}

function updateDentalMarks() {
  const chkNorm = document.getElementById('chkDentalNormal');
  const chkAbn = document.getElementById('chkDentalAbnormal');
  
  if (chkNorm) {
    if (chkNorm.checked) chkNorm.setAttribute('checked', 'checked');
    else chkNorm.removeAttribute('checked');
    const mNorm = document.getElementById('mark_chkDentalNormal');
    if (mNorm) {
      mNorm.innerHTML = chkNorm.checked 
        ? '<strong style="font-family: monospace; font-size: 13px;">[&nbsp;<span style="color: #15803d; font-weight: 900;">✓</span>&nbsp;]</strong>' 
        : '<span style="color: #64748b; font-family: monospace; font-size: 13px;">[&nbsp;&nbsp;&nbsp;]</span>';
    }
  }

  if (chkAbn) {
    if (chkAbn.checked) chkAbn.setAttribute('checked', 'checked');
    else chkAbn.removeAttribute('checked');
    const mAbn = document.getElementById('mark_chkDentalAbnormal');
    if (mAbn) {
      mAbn.innerHTML = chkAbn.checked 
        ? '<strong style="font-family: monospace; font-size: 13px;">[&nbsp;<span style="color: #dc2626; font-weight: 900;">✓</span>&nbsp;]</strong>' 
        : '<span style="color: #64748b; font-family: monospace; font-size: 13px;">[&nbsp;&nbsp;&nbsp;]</span>';
    }
  }
}

function executePrintDocument() {
  const printEl = document.getElementById('assessmentPrintArea');
  if (!printEl) return;

  // ซิงค์ attribute checked
  printEl.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(chk => {
    if (chk.checked) chk.setAttribute('checked', 'checked');
    else chk.removeAttribute('checked');
  });

  const printContent = printEl.innerHTML;
  const printWindow = window.open('', '_blank', 'width=950,height=800');
  if (!printWindow) {
    window.print();
    return;
  }

  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="th">
    <head>
      <meta charset="UTF-8">
      <title>แบบประเมินผลการตรวจสุขภาพประจำปีโรงพยาบาลไทรโยค</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;600;700&family=Sarabun:wght@400;500;600;700&display=swap" rel="stylesheet">
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
      <style>
        @page { size: A4 portrait; margin: 8mm 10mm 8mm 10mm; }
        body { font-family: 'Sarabun', sans-serif; font-size: 11.5px; line-height: 1.4; color: #000; background: #fff; margin: 0; padding: 0; }
        h4 { font-family: 'Kanit', sans-serif; font-size: 17px; font-weight: 700; margin-bottom: 2px; }
        .section-header { font-weight: 700; font-size: 12.5px; border-bottom: 1.5px solid #000; padding-bottom: 3px; margin-top: 10px; margin-bottom: 6px; }
        .dot-line { border-bottom: 1px dotted #333; display: inline-block; min-width: 90px; padding: 0 4px; font-weight: 600; }
        .asm-check-label { display: inline-flex; align-items: center; line-height: 1.3; }
        .asm-mark { font-family: monospace, Courier, monospace; font-size: 12.5px; display: inline-block; color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      </style>
    </head>
    <body>
      <div class="assessment-sheet">${printContent}</div>
      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); window.close(); }, 350);
        };
      <\/script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

// =========================================================================
// ส่งออกข้อมูลตารางไปยัง Excel (XLSX)
// =========================================================================
function exportTableToExcel() {
  if (!appState.filteredRows.length) {
    Swal.fire({ icon: 'info', title: 'ไม่มีข้อมูลที่จะส่งออก' });
    return;
  }

  const exportData = appState.filteredRows.map((r, i) => ({
    'ลำดับ': i + 1,
    'วันที่ตรวจ': r.vstdate || '',
    'HN': r.hn || '',
    'VN': r.vn || '',
    'ชื่อ-นามสกุล': r.ptname || '',
    'อายุ (ปี)': r.age_y || '',
    'รหัสสิทธิ': r.pttype || '',
    'ชื่อสิทธิ': r.pttype_name || '',
    'กลุ่มสุขภาพ (CL)': r.group_cl || 'ยังไม่ประเมิน',
    'คำแนะนำ (CJ)': r.advice_cj || '',
    'BMI': r.bmi || '',
    'ความดัน': r.bp || '',
    'ชีพจร': r.pulse || '',
    'การวินิจฉัย': r.all_diag_desc || r.pdx || '',
    'โรคประจำตัว': r.pmh || ''
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportData);
  XLSX.utils.book_append_sheet(wb, ws, 'ข้อมูลตรวจสุขภาพ');

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Saiyok_Healthcheckup_Data_${today}.xlsx`);
}

// =========================================================================
// การตั้งค่า URL ของ Google Apps Script API
// =========================================================================
function saveApiUrlSetting() {
  const input = document.getElementById('apiUrlInput');
  const newUrl = (input ? input.value : '').trim();
  if (!newUrl) {
    Swal.fire({ icon: 'warning', title: 'กรุณาระบุ URL ของ Web App' });
    return;
  }

  appState.apiUrl = newUrl;
  localStorage.setItem('saiyok_api_url', newUrl);

  Swal.fire({
    icon: 'success',
    title: 'บันทึกการตั้งค่าแล้ว',
    text: 'ระบบจะใช้ Web App URL ใหม่ในการเชื่อมต่อ',
    timer: 1500,
    showConfirmButton: false
  });

  loadSheetData();
}

// Helper Debounce
function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

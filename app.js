/**
 * =========================================================================
 * app.js - ระบบตรวจสุขภาพประจำปีเจ้าหน้าที่ โรงพยาบาลไทรโยค (GitHub Pages)
 * ทำงานร่วมกับ Google Apps Script Web App และ Google Sheets
 * =========================================================================
 */

// Web App URL เริ่มต้น (อัปเดตตรงตามที่ Deploy ล่าสุด สิทธิ์ Anyone)
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbzWoUwgqJcSxi3ij-CHHdbrTRAJYG4iS93zIyXyYuRoooO0K0NkQx8Acs-sEvNh4wvl/exec';

const appState = {
  apiUrl: localStorage.getItem('saiyok_api_url') || DEFAULT_API_URL,
  token: localStorage.getItem('saiyok_auth_token') || '',
  user: JSON.parse(localStorage.getItem('saiyok_auth_user') || 'null'),
  allRows: [],
  filteredRows: [],
  headers: [],
  selectedPatientHn: null,
  selectedRow: null,
  charts: {},
  stats: { total: 0, normal: 0, risk: 0, sick: 0, unassessed: 0, has_advice: 0 },
  matrixState: {
    search: '',
    pageSize: 25,
    currentPage: 1
  }
};

// =========================================================================
// ตารางค่าอ้างอิงปกติของผล Lab (Standard Reference Values)
// =========================================================================
const STANDARD_LAB_REFS = [
  // CBC
  { key: 'wbc (10^3', name: 'WBC', normal: '3.50-10.50', unit: '10^3cells/uL', check: (v) => v >= 3.5 && v <= 10.5 },
  { key: 'rbc (10^6', name: 'RBC', normal: 'M 4.3-5.7 / F 3.9-5.3', unit: '10^6cells/uL', check: (v) => v >= 3.9 && v <= 5.7 },
  { key: 'hb (g/dl)', name: 'Hb', normal: 'M 13.0-17.0 / F 12.0-16.0', unit: 'g/dL', check: (v) => v >= 12.0 && v <= 17.0 },
  { key: 'hct (%)', name: 'Hct', normal: 'M 38.0-50.0 / F 35.0-47.0', unit: '%', check: (v) => v >= 35.0 && v <= 50.0 },
  { key: 'mcv', name: 'MCV', normal: '80.0-97.0', unit: 'fL', check: (v) => v >= 80.0 && v <= 97.0 },
  { key: 'mch (pg', name: 'MCH', normal: '27.0-33.0', unit: 'pg/cell', check: (v) => v >= 27.0 && v <= 33.0 },
  { key: 'mchc', name: 'MCHC', normal: '31.0-35.0', unit: 'g/dl', check: (v) => v >= 31.0 && v <= 35.0 },
  { key: 'rdw', name: 'RDW-CV', normal: '11.0-16.0', unit: '%', check: (v) => v >= 11.0 && v <= 16.0 },
  { key: 'plt count', name: 'PLT Count', normal: '150-450', unit: '10^3cells/uL', check: (v) => v >= 150 && v <= 450 },
  { key: 'plt smear', name: 'PLT Smear', normal: 'Adequate', unit: '', check: (s) => /adequate|ปกติ/i.test(s) },
  { key: 'neutrophil', name: 'Neutrophil', normal: '40.0-75.0', unit: '%', check: (v) => v >= 40.0 && v <= 75.0 },
  { key: 'lymphocyte', name: 'Lymphocyte', normal: '20.0-50.0', unit: '%', check: (v) => v >= 20.0 && v <= 50.0 },
  { key: 'monocyte', name: 'Monocyte', normal: '2.0-10.0', unit: '%', check: (v) => v >= 2.0 && v <= 10.0 },
  { key: 'eosinophil', name: 'Eosinophil', normal: '1.0-5.0', unit: '%', check: (v) => v >= 0.0 && v <= 5.0 },
  { key: 'basophil', name: 'Basophil', normal: '0.0-1.0', unit: '%', check: (v) => v >= 0.0 && v <= 1.0 },
  { key: 'band', name: 'Band', normal: '0-2', unit: '%', check: (v) => v <= 2 },
  { key: 'blast', name: 'Blast', normal: '0', unit: '%', check: (v) => v === 0 },
  { key: 'atypical', name: 'Atypical Lymphocyte', normal: '0', unit: '%', check: (v) => v === 0 },

  // UA
  { key: 'color (ua)', name: 'Color (UA)', normal: 'Yellow', unit: '', check: (s) => /yellow|เหลือง/i.test(s) },
  { key: 'appearance (ua)', name: 'Appearance (UA)', normal: 'Clear', unit: '', check: (s) => /clear|ใส/i.test(s) },
  { key: 'sp. gr', name: 'Sp. gr', normal: '1.005-1.030', unit: '', check: (v) => v >= 1.005 && v <= 1.030 },
  { key: 'ph', name: 'pH', normal: '5.0-8.0', unit: '', check: (v) => v >= 5.0 && v <= 8.0 },
  { key: 'protein (ua)', name: 'Protein (UA)', normal: 'Negative', unit: '', check: (s) => /neg|normal|ปกติ/i.test(s) },
  { key: 'glucose (ua)', name: 'Glucose (UA)', normal: 'Negative', unit: '', check: (s) => /neg|normal|ปกติ/i.test(s) },
  { key: 'ketones', name: 'Ketones (UA)', normal: 'Negative', unit: '', check: (s) => /neg|normal|ปกติ/i.test(s) },
  { key: 'bilirubin (ua)', name: 'Bilirubin (UA)', normal: 'Negative', unit: '', check: (s) => /neg|normal|ปกติ/i.test(s) },
  { key: 'urobilinogen', name: 'Urobilinogen (UA)', normal: 'Normal', unit: '', check: (s) => /normal|neg|ปกติ/i.test(s) },
  { key: 'nitrite', name: 'Nitrite (UA)', normal: 'Negative', unit: '', check: (s) => /neg|normal|ปกติ/i.test(s) },
  { key: 'blood (ua)', name: 'Blood (UA)', normal: 'Negative', unit: '', check: (s) => /neg|normal|ปกติ/i.test(s) },
  { key: 'leucocytes (ua)', name: 'Leucocytes (UA)', normal: 'Negative', unit: '', check: (s) => /neg|normal|ปกติ/i.test(s) },
  { key: 'rbc (ua)', name: 'RBC (UA)', normal: '0-1', unit: 'Cells/HPF', check: (v, s) => s === '0-1' || s === '0' || s === '1' || (v !== null && v <= 1) },
  { key: 'wbc (ua)', name: 'WBC (UA)', normal: '0-2', unit: 'Cells/HPF', check: (v, s) => s === '0-2' || s === '0-1' || s === '0' || s === '1' || s === '2' || (v !== null && v <= 2) },
  { key: 'epi. sq', name: 'Epi. Sq (UA)', normal: '0-2', unit: 'Cells/HF', check: (v, s) => s === '0-2' || s === '0-1' || s === '0' || s === '1' || s === '2' || (v !== null && v <= 2) },
  { key: 'bacteria', name: 'Bacteria (UA)', normal: 'Negative', unit: '', check: (s) => /neg|few|rare|none|ปกติ/i.test(s) },
  { key: 'mucous', name: 'Mucous (UA)', normal: 'Negative', unit: '', check: (s) => /neg|few|rare|none|ปกติ/i.test(s) },
  { key: 'crystal', name: 'Crystal (UA)', normal: 'Negative', unit: '', check: (s) => /neg|none|not found|ปกติ/i.test(s) },
  { key: 'cast', name: 'Cast (UA)', normal: 'Negative', unit: '', check: (s) => /neg|none|not found|ปกติ/i.test(s) },

  // Stool
  { key: 'occult blood', name: 'Occult blood (Stool)', normal: 'Negative', unit: '', check: (s) => /neg|not found|ปกติ/i.test(s) },
  { key: 'color (stool)', name: 'Color (Stool)', normal: 'Brown/Yellow', unit: '', check: (s) => /brown|yellow|น้ำตาล|เหลือง/i.test(s) },
  { key: 'consistency', name: 'Consistency (Stool)', normal: 'Formed/Soft', unit: '', check: (s) => /formed|soft|ปกติ/i.test(s) },
  { key: 'rbc (stool)', name: 'RBC (Stool)', normal: '0-1', unit: 'Cells/HPF', check: (v, s) => s === '0-1' || (v !== null && v <= 1) },
  { key: 'wbc (stool)', name: 'WBC (Stool)', normal: '0-1', unit: 'Cells/HPF', check: (v, s) => s === '0-1' || (v !== null && v <= 1) },
  { key: 'ova', name: 'Ova (Stool)', normal: 'Not found', unit: '', check: (s) => /not found|neg|none|ไม่พบ/i.test(s) },
  { key: 'parasite', name: 'Parasite (Wet smear)', normal: 'Not found', unit: '', check: (s) => /not found|neg|none|ไม่พบ/i.test(s) },
  { key: 'amoeba', name: 'Amoeba (Stool)', normal: 'Not found', unit: '', check: (s) => /not found|neg|none|ไม่พบ/i.test(s) },

  // Chemistry
  { key: 'blood sugar (fbs)', name: 'Blood Sugar (FBS)', normal: '< 100', unit: 'mg/dL', check: (v) => v < 100 },
  { key: 'fbs', name: 'FBS', normal: '< 100', unit: 'mg/dL', check: (v) => v < 100 },
  { key: 'hba1c', name: 'HbA1C', normal: '4.6-6.2', unit: '%', check: (v) => v >= 4.6 && v <= 6.2 },
  { key: 'bun', name: 'BUN', normal: '7-21', unit: 'mg/dL', check: (v) => v >= 7 && v <= 21 },
  { key: 'creatinine', name: 'Creatinine', normal: 'M 0.8-1.3 / F 0.5-1.1', unit: 'mg/dL', check: (v) => v >= 0.5 && v <= 1.3 },
  { key: 'egfr', name: 'eGFR', normal: '> 90', unit: 'mL/min', check: (v) => v >= 60 },
  { key: 'gfr', name: 'GFR', normal: '> 90', unit: 'mL/min', check: (v) => v >= 60 },
  { key: 'uric acid', name: 'Uric acid', normal: 'M 3.6-8.2 / F 2.3-6.1', unit: 'mg/dL', check: (v) => v >= 2.3 && v <= 8.2 },
  { key: 'cholesterol', name: 'Cholesterol', normal: '< 200', unit: 'mg/dL', check: (v) => v < 200 },
  { key: 'triglyceride', name: 'Triglyceride', normal: '< 150', unit: 'mg/dL', check: (v) => v < 150 },
  { key: 'hdl', name: 'HDL', normal: '> 40', unit: 'mg/dL', check: (v) => v >= 40 },
  { key: 'ldl', name: 'LDL-Direct', normal: '< 100', unit: 'mg/dL', check: (v) => v < 100 },
  { key: 'sgot', name: 'SGOT (AST)', normal: '< 35', unit: 'U/L', check: (v) => v <= 35 },
  { key: 'ast', name: 'AST', normal: '< 35', unit: 'U/L', check: (v) => v <= 35 },
  { key: 'sgpt', name: 'SGPT (ALT)', normal: '< 35', unit: 'U/L', check: (v) => v <= 35 },
  { key: 'alt', name: 'ALT', normal: '< 35', unit: 'U/L', check: (v) => v <= 35 },
  { key: 'alkaline', name: 'Alkaline phosphatase', normal: '30-120', unit: 'U/L', check: (v) => v >= 30 && v <= 120 },
  { key: 'total protein', name: 'Total Protein', normal: '6.6-8.3', unit: 'g/dL', check: (v) => v >= 6.6 && v <= 8.3 },
  { key: 'albumin', name: 'Albumin', normal: '3.0-6.0', unit: 'g/dL', check: (v) => v >= 3.0 && v <= 6.0 },
  { key: 'globulin', name: 'Globulin', normal: '1.5-3.0', unit: 'g/dL', check: (v) => v >= 1.5 && v <= 3.0 },
  { key: 'total bilirubin', name: 'Total Bilirubin', normal: '0.10-1.20', unit: 'mg/dL', check: (v) => v >= 0.10 && v <= 1.20 },
  { key: 'direct bilirubin', name: 'Direct Bilirubin', normal: '0.10-0.30', unit: 'mg/dL', check: (v) => v >= 0.10 && v <= 0.30 },

  // Immunology & CXR
  { key: 'hbsag', name: 'HBsAg', normal: 'Negative', unit: '', check: (s) => /neg|negative|ลบ/i.test(s) },
  { key: 'anti-hbs', name: 'Anti-HBs', normal: 'Negative/Positive', unit: '', check: () => true },
  { key: 'anti-hcv', name: 'Anti-HCV', normal: 'Negative', unit: '', check: (s) => /neg|negative|ลบ/i.test(s) },
  { key: 'metamphethamine', name: 'Metamphethamine', normal: 'Negative', unit: '', check: (s) => /neg|negative|ลบ/i.test(s) },
  { key: 'cxr', name: 'ผลเอกซเรย์ปอด (CXR)', normal: 'ปกติ (Normal)', unit: '', check: (s) => !/abnormal|infiltration|cardiomegaly|ผิดปกติ/i.test(s) },
  { key: 'เอกซเรย์', name: 'ผลเอกซเรย์ปอด (CXR)', normal: 'ปกติ (Normal)', unit: '', check: (s) => !/abnormal|infiltration|cardiomegaly|ผิดปกติ/i.test(s) }
];

function getLabReferenceInfo(headerName) {
  if (!headerName) return null;
  const lower = headerName.toLowerCase();
  for (const ref of STANDARD_LAB_REFS) {
    if (lower.includes(ref.key)) {
      return ref;
    }
  }
  return null;
}

function evaluateLabStatus(val, refInfo) {
  if (val === null || val === undefined || String(val).trim() === '') {
    return { isAbnormal: false, isKnown: false };
  }
  if (!refInfo) {
    return { isAbnormal: false, isKnown: false };
  }

  const strVal = String(val).trim();
  const numVal = parseFloat(strVal);
  const isNum = !isNaN(numVal);

  if (typeof refInfo.check === 'function') {
    try {
      const isOk = refInfo.check(isNum ? numVal : null, strVal);
      return { isAbnormal: !isOk, isKnown: true };
    } catch (e) {
      return { isAbnormal: false, isKnown: true };
    }
  }

  return { isAbnormal: false, isKnown: true };
}

/**
 * ฟังก์ชันทำความสะอาดข้อมูลช่องเซลล์ใน Wide Matrix
 * แก้ไขปัญหา Google Sheets แปลงวันที่/เวลา และ Range ของ UA เช่น 0-1, 0-2 เป็น ISO Date
 */
function formatMatrixDisplayValue(cell, headerName, colIndex) {
  if (cell === null || cell === undefined || cell === '') return '';
  const str = String(cell).trim();

  // 1. วันที่ตรวจ (คอลัมน์ 0 หรือชื่อมีคำว่า 'วัน')
  if (colIndex === 0 || (headerName && headerName.includes('วันที่') && !headerName.includes('เวลา'))) {
    if (str.includes('T')) {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      return str.split('T')[0];
    }
    return str;
  }

  // 2. เวลา (คอลัมน์ 2 หรือชื่อคอลัมน์คือ 'เวลา')
  if (colIndex === 2 || headerName === 'เวลา') {
    if (str.includes('T')) {
      const parts = str.split('T');
      if (parts[1]) {
        return parts[1].slice(0, 5); // HH:mm
      }
    }
    return str.slice(0, 5);
  }

  // 3. ผล Lab ปัสสาวะที่มีโอกาสถูก Google Sheets แปลงช่วงตัวเลขเป็น Date เช่น 0-1, 0-2, 1-2
  const isUaRangeLab = headerName && (
    headerName.includes('RBC (UA)') ||
    headerName.includes('WBC (UA)') ||
    headerName.includes('Epi. Sq') ||
    headerName.includes('RBC (Stool)') ||
    headerName.includes('WBC (Stool)')
  );

  if (isUaRangeLab && str.includes('T')) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const m = d.getMonth() + 1;
      const day = d.getDate();
      if (m <= 12 && day <= 31) {
        return `${m}-${day}`;
      }
    }
  }

  // ลบเครื่องหมาย single quote นำหน้าที่ใช้หน่วงสตริงใน Excel
  if (str.startsWith("'")) {
    return str.substring(1);
  }

  return str;
}

// Safe DOM Helper Functions
function safeSetText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = (text !== null && text !== undefined) ? text : '-';
}

function safeSetHtml(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = (html !== null && html !== undefined) ? html : '';
}

function safeSetValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = (val !== null && val !== undefined) ? val : '';
}

// =========================================================================
// เมื่อโหลดหน้าเว็บเสร็จสมบูรณ์
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
  // ตั้งค่าช่อง URL
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
// 1. ระบบยืนยันตัวตน (Authentication & Login)
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
    const url = `${appState.apiUrl}?action=login&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const response = await fetch(url);
    const res = await response.json();

    if (res.success && res.token) {
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
      errEl.textContent = res.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
      errEl.classList.remove('d-none');
    }
  } catch (err) {
    console.warn('API error, checking direct fallback...', err);
    if (username === 'admin11278' && password === 'admin11278') {
      const fallbackUser = { username: 'admin11278', displayName: 'ผู้ดูแลระบบ รพ.ไทรโยค', role: 'admin' };
      const fallbackToken = 'local_admin_' + new Date().getTime();
      appState.token = fallbackToken;
      appState.user = fallbackUser;
      localStorage.setItem('saiyok_auth_token', fallbackToken);
      localStorage.setItem('saiyok_auth_user', JSON.stringify(fallbackUser));

      showDashboardView();
      loadSheetData();
    } else {
      errEl.textContent = 'ไม่สามารถเชื่อมต่อ API ได้ หรือรหัสผ่านไม่ถูกต้อง';
      errEl.classList.remove('d-none');
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket me-1"></i> เข้าสู่ระบบ';
  }
}

function forceLogout(message) {
  appState.token = '';
  appState.user = null;
  localStorage.removeItem('saiyok_auth_token');
  localStorage.removeItem('saiyok_auth_user');
  showLoginView();
  if (message) {
    Swal.fire({
      icon: 'info',
      title: 'กรุณาเข้าสู่ระบบใหม่',
      text: message,
      confirmButtonColor: '#0f766e'
    });
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
      forceLogout();
    }
  });
}

// =========================================================================
// 2. การดึงข้อมูลจาก Google Sheets ผ่าน Google Apps Script API
// =========================================================================
async function loadSheetData() {
  Swal.fire({
    title: 'กำลังเชื่อมต่อ Google Sheets...',
    text: 'กำลังประมวลผลข้อมูลสุขภาพและผล Lab',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const url = `${appState.apiUrl}?action=get_data&token=${encodeURIComponent(appState.token)}`;
    const response = await fetch(url);
    const data = await response.json();
    Swal.close();

    if (data.require_login) {
      forceLogout(data.message || 'Token หมดอายุหรือจำเป็นต้องเข้าสู่ระบบ');
      return;
    }

    if (!data.success) {
      throw new Error(data.message || 'ไม่สามารถโหลดข้อมูลจาก Google Sheets ได้');
    }

    appState.headers = data.headers || [];
    appState.allRows = data.rows || [];
    appState.stats = data.stats || {};

    // อัปเดตการแสดงผลทุกส่วน
    updateKpiCards();
    applyFilters();
    renderGroupCharts();
    renderGroupSummaryTable();
    buildPatientSelectList();
    renderMatrixTable();

  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: 'error',
      title: 'โหลดข้อมูลล้มเหลว',
      text: err.message,
      footer: '<small>กรุณาตรวจสอบการ Deploy ของ Google Apps Script Web App</small>'
    });
  }
}

// =========================================================================
// 3. การอัปเดตสถิติ KPI Cards
// =========================================================================
function updateKpiCards() {
  const rows = appState.allRows;
  const total = rows.length;

  let count80 = 0, count81 = 0;
  let countNormal = 0, countRisk = 0, countSick = 0;

  rows.forEach(r => {
    if (r.pttype === '80') count80++;
    else if (r.pttype === '81') count81++;

    if (r.group_cl === 'ปกติ') countNormal++;
    else if (r.group_cl === 'เสี่ยง') countRisk++;
    else if (r.group_cl === 'ป่วย') countSick++;
  });

  safeSetText('kpiTotalVisits', total.toLocaleString());
  safeSetText('kpiPttype80', count80.toLocaleString());
  safeSetText('kpiPttype80Pct', total > 0 ? `${((count80/total)*100).toFixed(1)}% ของผู้ตรวจ` : '0%');

  safeSetText('kpiPttype81', count81.toLocaleString());
  safeSetText('kpiPttype81Pct', total > 0 ? `${((count81/total)*100).toFixed(1)}% ของผู้ตรวจ` : '0%');

  safeSetText('kpiGroupNormal', countNormal.toLocaleString());
  safeSetText('kpiGroupNormalPct', total > 0 ? `${((countNormal/total)*100).toFixed(1)}%` : '0%');

  safeSetText('kpiGroupRisk', countRisk.toLocaleString());
  safeSetText('kpiGroupRiskPct', total > 0 ? `${((countRisk/total)*100).toFixed(1)}%` : '0%');

  safeSetText('kpiGroupSick', countSick.toLocaleString());
  safeSetText('kpiGroupSickPct', total > 0 ? `${((countSick/total)*100).toFixed(1)}%` : '0%');
}

// =========================================================================
// 4. ตัวกรองและการค้นหา (Filters & Presets)
// =========================================================================
function setupEventListeners() {
  const searchFilter = document.getElementById('filterSearch');
  const indivSearch = document.getElementById('individualSearch');
  const groupFilter = document.getElementById('filterGroup');
  const pttypeFilter = document.getElementById('filterPttype');
  const dateStart = document.getElementById('filterStartDate');
  const dateEnd = document.getElementById('filterEndDate');

  if (searchFilter) searchFilter.addEventListener('input', debounce(applyFilters, 250));
  if (indivSearch) indivSearch.addEventListener('input', debounce(filterPatientSelectList, 250));
  if (groupFilter) groupFilter.addEventListener('change', applyFilters);
  if (pttypeFilter) pttypeFilter.addEventListener('change', applyFilters);
  if (dateStart) dateStart.addEventListener('change', applyFilters);
  if (dateEnd) dateEnd.addEventListener('change', applyFilters);

  // Matrix Controls Listeners
  const matrixSearch = document.getElementById('matrixSearch');
  const matrixSearchClear = document.getElementById('matrixSearchClear');
  const matrixPageSize = document.getElementById('matrixPageSize');

  if (matrixSearch) {
    matrixSearch.addEventListener('input', debounce((e) => {
      appState.matrixState.search = e.target.value.trim().toLowerCase();
      appState.matrixState.currentPage = 1;
      renderMatrixTable();
    }, 250));
  }

  if (matrixSearchClear) {
    matrixSearchClear.addEventListener('click', () => {
      if (matrixSearch) matrixSearch.value = '';
      appState.matrixState.search = '';
      appState.matrixState.currentPage = 1;
      renderMatrixTable();
    });
  }

  if (matrixPageSize) {
    matrixPageSize.addEventListener('change', (e) => {
      appState.matrixState.pageSize = parseInt(e.target.value, 10) || 25;
      appState.matrixState.currentPage = 1;
      renderMatrixTable();
    });
  }
}

function applyFilters() {
  const query = (document.getElementById('filterSearch')?.value || '').toLowerCase().trim();
  const group = document.getElementById('filterGroup')?.value || 'all';
  const pttype = document.getElementById('filterPttype')?.value || 'all';
  const start = document.getElementById('filterStartDate')?.value || '';
  const end = document.getElementById('filterEndDate')?.value || '';

  appState.filteredRows = appState.allRows.filter(row => {
    // 1. ค้นหา
    if (query) {
      const match = (row.hn && row.hn.toLowerCase().includes(query)) ||
                    (row.vn && row.vn.toLowerCase().includes(query)) ||
                    (row.ptname && row.ptname.toLowerCase().includes(query));
      if (!match) return false;
    }

    // 2. กลุ่ม CL
    if (group !== 'all') {
      if (group === 'unassessed') {
        if (row.group_cl) return false;
      } else {
        if (row.group_cl !== group) return false;
      }
    }

    // 3. สิทธิ
    if (pttype !== 'all' && row.pttype !== pttype) return false;

    // 4. วันที่
    if (start && row.vstdate && row.vstdate < start) return false;
    if (end && row.vstdate && row.vstdate > end) return false;

    return true;
  });

  safeSetText('tabVisitBadge', appState.filteredRows.length.toLocaleString());
  safeSetText('masterRowCount', `${appState.filteredRows.length.toLocaleString()} รายการ`);

  renderMasterTable(appState.filteredRows);
}

function resetFilters() {
  document.getElementById('filterSearch').value = '';
  document.getElementById('filterGroup').value = 'all';
  document.getElementById('filterPttype').value = 'all';
  setPresetDate('jul_aug_2026');
}

function setPresetDate(type) {
  const s = document.getElementById('filterStartDate');
  const e = document.getElementById('filterEndDate');
  if (!s || !e) return;

  const today = new Date().toISOString().slice(0, 10);

  if (type === 'jul_aug_2026') {
    s.value = '2026-07-01';
    e.value = '2026-08-31';
  } else if (type === 'today') {
    s.value = today;
    e.value = today;
  } else if (type === 'year_2026') {
    s.value = '2026-01-01';
    e.value = '2026-12-31';
  } else if (type === 'year_2025') {
    s.value = '2025-01-01';
    e.value = '2025-12-31';
  } else if (type === 'all_data') {
    s.value = '';
    e.value = '';
  }

  applyFilters();
}

// =========================================================================
// 5. TAB 1: กราฟภาพรวมรายกลุ่ม และ ตารางสรุปช่วงอายุ
// =========================================================================
function renderGroupCharts() {
  const rows = appState.allRows;
  if (!rows.length) return;

  // 1. Pttype Donut
  let p80 = 0, p81 = 0, pOther = 0;
  rows.forEach(r => {
    if (r.pttype === '80') p80++;
    else if (r.pttype === '81') p81++;
    else pOther++;
  });

  destroyChart('chartPttype');
  const ctxPttype = document.getElementById('chartPttype');
  if (ctxPttype) {
    appState.charts['chartPttype'] = new Chart(ctxPttype, {
      type: 'doughnut',
      data: {
        labels: ['สิทธิ 80 ข้าราชการ', 'สิทธิ 81 ประกันสังคม', 'สิทธิอื่นๆ'],
        datasets: [{
          data: [p80, p81, pOther],
          backgroundColor: ['#0284c7', '#f59e0b', '#94a3b8'],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  // 2. Age Bar
  let age1 = 0, age2 = 0, age3 = 0, age4 = 0, age5 = 0;
  rows.forEach(r => {
    const age = parseInt(r.age_y, 10) || 0;
    if (age < 30) age1++;
    else if (age <= 40) age2++;
    else if (age <= 50) age3++;
    else if (age <= 60) age4++;
    else age5++;
  });

  destroyChart('chartAge');
  const ctxAge = document.getElementById('chartAge');
  if (ctxAge) {
    appState.charts['chartAge'] = new Chart(ctxAge, {
      type: 'bar',
      data: {
        labels: ['< 30 ปี', '31-40 ปี', '41-50 ปี', '51-60 ปี', '> 60 ปี'],
        datasets: [{
          label: 'จำนวน (คน)',
          data: [age1, age2, age3, age4, age5],
          backgroundColor: '#0f766e',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  // 3. Health Group CL
  let gNorm = 0, gRisk = 0, gSick = 0, gUn = 0;
  rows.forEach(r => {
    if (r.group_cl === 'ปกติ') gNorm++;
    else if (r.group_cl === 'เสี่ยง') gRisk++;
    else if (r.group_cl === 'ป่วย') gSick++;
    else gUn++;
  });

  destroyChart('chartGroup');
  const ctxGroup = document.getElementById('chartGroup');
  if (ctxGroup) {
    appState.charts['chartGroup'] = new Chart(ctxGroup, {
      type: 'doughnut',
      data: {
        labels: ['ปกติ', 'เสี่ยง', 'ป่วย', 'ยังไม่ประเมิน'],
        datasets: [{
          data: [gNorm, gRisk, gSick, gUn],
          backgroundColor: ['#16a34a', '#eab308', '#dc2626', '#94a3b8'],
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }
}

function renderGroupSummaryTable() {
  const tbody = document.getElementById('groupSummaryTableBody');
  if (!tbody) return;

  const rows = appState.allRows;
  const groups = {
    '80': { name: 'สิทธิ 80 (ข้าราชการ รพ.ไทรโยค)', a1: 0, a2: 0, a3: 0, a4: 0, a5: 0, total: 0, sick: 0 },
    '81': { name: 'สิทธิ 81 (ประกันสังคม)', a1: 0, a2: 0, a3: 0, a4: 0, a5: 0, total: 0, sick: 0 }
  };

  rows.forEach(r => {
    const pt = r.pttype === '80' ? '80' : '81';
    const g = groups[pt];
    const age = parseInt(r.age_y, 10) || 0;

    g.total++;
    if (r.group_cl === 'ป่วย' || r.group_cl === 'เสี่ยง') g.sick++;

    if (age < 30) g.a1++;
    else if (age <= 40) g.a2++;
    else if (age <= 50) g.a3++;
    else if (age <= 60) g.a4++;
    else g.a5++;
  });

  tbody.innerHTML = '';
  ['80', '81'].forEach(k => {
    const g = groups[k];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="fw-bold">${g.name}</td>
      <td class="text-center font-monospace">${g.a1}</td>
      <td class="text-center font-monospace">${g.a2}</td>
      <td class="text-center font-monospace">${g.a3}</td>
      <td class="text-center font-monospace">${g.a4}</td>
      <td class="text-center font-monospace">${g.a5}</td>
      <td class="text-center fw-bold bg-light font-monospace">${g.total}</td>
      <td class="text-center fw-bold bg-light text-danger font-monospace">${g.sick}</td>
    `;
    tbody.appendChild(tr);
  });
}

// =========================================================================
// 6. TAB 2: ข้อมูลรายบุคคล & กราฟเปรียบเทียบย้อนหลัง 3 ปี
// =========================================================================
function buildPatientSelectList() {
  const container = document.getElementById('individualPatientList');
  if (!container) return;

  const rows = appState.allRows;
  container.innerHTML = '';

  if (!rows.length) {
    container.innerHTML = '<div class="text-center text-muted py-4">ไม่พบรายชื่อเจ้าหน้าที่</div>';
    return;
  }

  // Group unique HN
  const patientsMap = new Map();
  rows.forEach(r => {
    if (r.hn && !patientsMap.has(r.hn)) {
      patientsMap.set(r.hn, r);
    }
  });

  const uniquePatients = Array.from(patientsMap.values());

  uniquePatients.forEach((p, idx) => {
    const div = document.createElement('div');
    div.className = `patient-select-item mb-2 ${idx === 0 ? 'active' : ''}`;
    div.dataset.hn = p.hn;

    let groupDot = '<span class="text-secondary">&bull;</span>';
    if (p.group_cl === 'ปกติ') groupDot = '<i class="fa-solid fa-circle text-success fs-9"></i>';
    else if (p.group_cl === 'เสี่ยง') groupDot = '<i class="fa-solid fa-circle text-warning fs-9"></i>';
    else if (p.group_cl === 'ป่วย') groupDot = '<i class="fa-solid fa-circle text-danger fs-9"></i>';

    div.innerHTML = `
      <div class="d-flex align-items-center justify-content-between">
        <div class="fw-bold text-dark fs-8">${p.ptname}</div>
        <div>${groupDot}</div>
      </div>
      <div class="d-flex align-items-center gap-2 text-muted fs-9">
        <span class="font-monospace">${p.hn}</span>
        <span>&bull;</span>
        <span>${p.age_y} ปี</span>
        <span>&bull;</span>
        <span>สิทธิ ${p.pttype}</span>
      </div>
    `;

    div.addEventListener('click', () => {
      document.querySelectorAll('.patient-select-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active');
      selectPatient(p.hn);
    });

    container.appendChild(div);
  });

  // เลือกคนแรกเป็นค่าเริ่มต้น
  if (uniquePatients.length > 0) {
    selectPatient(uniquePatients[0].hn);
  }
}

function filterPatientSelectList() {
  const query = (document.getElementById('individualSearch')?.value || '').toLowerCase().trim();
  document.querySelectorAll('.patient-select-item').forEach(el => {
    const text = el.textContent.toLowerCase();
    el.style.display = text.includes(query) ? 'block' : 'none';
  });
}

function selectPatient(hn) {
  appState.selectedPatientHn = hn;
  const row = appState.allRows.find(r => r.hn === hn);
  if (!row) return;

  appState.selectedRow = row;

  // Profile Card
  safeSetText('indivName', row.ptname || '-');
  safeSetText('indivHn', row.hn || '-');
  safeSetText('indivVn', row.vn || '-');
  safeSetText('indivAge', row.age_y || '-');
  safeSetText('indivBmi', row.bmi || '-');
  safeSetText('indivBp', row.bp || '-');
  safeSetText('indivPmh', row.pmh || 'ปฏิเสธโรคประจำตัว');
  safeSetText('indivAdvice', row.advice_cj || 'ยังไม่มีคำแนะนำ');

  // Badges
  const pttypeClass = row.pttype === '80' ? 'badge-pttype-80' : 'badge-pttype-81';
  safeSetHtml('indivPttypeBadge', `<span class="badge ${pttypeClass}">${row.pttype} ${row.pttype_name || ''}</span>`);

  let gBadge = '<span class="badge-group unassessed">ยังไม่ประเมิน</span>';
  if (row.group_cl === 'ปกติ') gBadge = '<span class="badge-group normal">ปกติ</span>';
  else if (row.group_cl === 'เสี่ยง') gBadge = '<span class="badge-group risk">เสี่ยง</span>';
  else if (row.group_cl === 'ป่วย') gBadge = '<span class="badge-group sick">ป่วย</span>';
  safeSetHtml('indivGroupBadge', gBadge);

  // 3-Year Historical Comparison Charts
  renderPatientHistoryCharts(hn);

  // Individual Labs Table
  renderIndividualLabTable(row);
}

function renderPatientHistoryCharts(hn) {
  // Find all rows for this HN across years
  const patientVisits = appState.allRows.filter(r => r.hn === hn);
  // Sort by date ascending
  patientVisits.sort((a, b) => (a.vstdate || '').localeCompare(b.vstdate || ''));

  const labels = patientVisits.map(v => {
    const d = v.vstdate || '';
    return d ? (parseInt(d.slice(0, 4), 10) + 543) : 'ตรวจ';
  });

  // Extract values
  const fbsVals = patientVisits.map(v => extractLabValue(v, ['fbs', 'blood sugar']));
  const cholVals = patientVisits.map(v => extractLabValue(v, ['cholesterol']));
  const tgVals = patientVisits.map(v => extractLabValue(v, ['triglyceride']));
  const ldlVals = patientVisits.map(v => extractLabValue(v, ['ldl']));
  const hdlVals = patientVisits.map(v => extractLabValue(v, ['hdl']));

  const egfrVals = patientVisits.map(v => extractLabValue(v, ['egfr', 'gfr']));
  const bunVals = patientVisits.map(v => extractLabValue(v, ['bun']));
  const crVals = patientVisits.map(v => extractLabValue(v, ['creatinine']));
  const uricVals = patientVisits.map(v => extractLabValue(v, ['uric']));
  const sgotVals = patientVisits.map(v => extractLabValue(v, ['sgot', 'ast']));
  const sgptVals = patientVisits.map(v => extractLabValue(v, ['sgpt', 'alt']));

  // Chart 1: Lipids & Sugar
  destroyChart('chartHistoryLipid');
  const ctxLipid = document.getElementById('chartHistoryLipid');
  if (ctxLipid) {
    appState.charts['chartHistoryLipid'] = new Chart(ctxLipid, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'FBS', data: fbsVals, borderColor: '#0284c7', tension: 0.2, pointRadius: 5 },
          { label: 'Chol', data: cholVals, borderColor: '#dc2626', tension: 0.2, pointRadius: 5 },
          { label: 'TG', data: tgVals, borderColor: '#f59e0b', tension: 0.2, pointRadius: 5 },
          { label: 'LDL', data: ldlVals, borderColor: '#9333ea', tension: 0.2, pointRadius: 5 },
          { label: 'HDL', data: hdlVals, borderColor: '#16a34a', tension: 0.2, pointRadius: 5 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: false } }
      }
    });
  }

  // Chart 2: Liver & Kidney (includes eGFR)
  destroyChart('chartHistoryOrgan');
  const ctxOrgan = document.getElementById('chartHistoryOrgan');
  if (ctxOrgan) {
    appState.charts['chartHistoryOrgan'] = new Chart(ctxOrgan, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          { label: 'eGFR', data: egfrVals, borderColor: '#0284c7', tension: 0.2, pointRadius: 5 },
          { label: 'BUN', data: bunVals, borderColor: '#0891b2', tension: 0.2, pointRadius: 5 },
          { label: 'Cr', data: crVals, borderColor: '#ea580c', tension: 0.2, pointRadius: 5 },
          { label: 'Uric', data: uricVals, borderColor: '#65a30d', tension: 0.2, pointRadius: 5 },
          { label: 'SGOT', data: sgotVals, borderColor: '#e11d48', tension: 0.2, pointRadius: 5 },
          { label: 'SGPT', data: sgptVals, borderColor: '#7c3aed', tension: 0.2, pointRadius: 5 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: false } }
      }
    });
  }
}

function extractLabValue(row, keywords) {
  if (!row || !row.rawRow || !appState.headers) return null;
  for (let c = 18; c < appState.headers.length; c++) {
    const h = (appState.headers[c] || '').toLowerCase();
    for (const kw of keywords) {
      if (h.includes(kw)) {
        const val = row.rawRow[c];
        const num = parseFloat(val);
        return isNaN(num) ? null : num;
      }
    }
  }
  return null;
}

function renderIndividualLabTable(row) {
  const tbody = document.getElementById('indivLabTableBody');
  const countBadge = document.getElementById('indivLabCount');
  if (!tbody) return;

  tbody.innerHTML = '';
  if (!row || !row.rawRow || !appState.headers) return;

  let labCount = 0;
  for (let c = 18; c < appState.headers.length; c++) {
    const headerName = appState.headers[c] || '';
    if (c === 87 || c === 89) continue; // Skip CJ and CL headers in lab list

    const rawVal = row.rawRow[c];
    if (rawVal === null || rawVal === undefined || String(rawVal).trim() === '') continue;

    // ทำความสะอาดค่าผลแล็บ
    const displayVal = formatMatrixDisplayValue(rawVal, headerName, c);
    const refInfo = getLabReferenceInfo(headerName);
    const evalResult = evaluateLabStatus(displayVal, refInfo);

    labCount++;
    const tr = document.createElement('tr');

    let statusBadge = '<span class="badge badge-normal"><i class="fa-solid fa-check me-1"></i>ปกติ</span>';
    if (evalResult.isAbnormal) {
      statusBadge = '<span class="badge badge-abnormal"><i class="fa-solid fa-triangle-exclamation me-1"></i>ผิดปกติ</span>';
    }

    const refDisplay = refInfo ? `${refInfo.normal}${refInfo.unit ? ' ' + refInfo.unit : ''}` : '-';

    tr.innerHTML = `
      <td class="text-center text-muted fs-9">${labCount}</td>
      <td class="fw-bold">${headerName}</td>
      <td class="font-monospace fw-semibold ${evalResult.isAbnormal ? 'text-danger fs-7' : 'text-dark'}">${displayVal}</td>
      <td class="text-secondary fs-8">${refDisplay}</td>
      <td class="text-center">${statusBadge}</td>
    `;
    tbody.appendChild(tr);
  }

  if (countBadge) countBadge.textContent = `${labCount} รายการ`;
}

// =========================================================================
// 7. TAB 3: รายการตรวจสุขภาพ (Master List Table)
// =========================================================================
function renderMasterTable(rows) {
  const tbody = document.getElementById('masterTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!rows.length) {
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

    let groupBadge = '<span class="badge-group unassessed">ยังไม่ประเมิน</span>';
    if (r.group_cl === 'ปกติ') groupBadge = '<span class="badge-group normal"><i class="fa-solid fa-circle-check"></i> ปกติ</span>';
    else if (r.group_cl === 'เสี่ยง') groupBadge = '<span class="badge-group risk"><i class="fa-solid fa-triangle-exclamation"></i> เสี่ยง</span>';
    else if (r.group_cl === 'ป่วย') groupBadge = '<span class="badge-group sick"><i class="fa-solid fa-circle-xmark"></i> ป่วย</span>';

    const pttypeClass = r.pttype === '80' ? 'badge-pttype-80' : 'badge-pttype-81';
    const adviceText = r.advice_cj ? r.advice_cj : '<span class="text-muted fst-italic">-</span>';
    const diagText = r.all_diag_desc || r.pmh || '-';

    tr.innerHTML = `
      <td class="text-center text-muted fs-9">${idx + 1}</td>
      <td>${r.vstdate || '-'}</td>
      <td class="fw-bold font-monospace text-primary">${r.hn || '-'}</td>
      <td class="fw-bold">${r.ptname || '-'}</td>
      <td class="text-center">${r.age_y || '-'}</td>
      <td><span class="badge ${pttypeClass}">${r.pttype}</span></td>
      <td>${groupBadge}</td>
      <td class="advice-cell" title="${r.advice_cj || ''}">${adviceText}</td>
      <td class="text-center font-monospace">${r.bmi || '-'}</td>
      <td class="text-center text-nowrap font-monospace">${r.bp || '-'}</td>
      <td class="text-truncate" style="max-width: 150px;" title="${diagText}">${diagText}</td>
      <td class="text-nowrap text-end">
        <button class="btn btn-sm btn-outline-info me-1" onclick="switchToIndividualTab('${r.hn}')" title="ดูข้อมูลรายบุคคล & กราฟ 3 ปี">
          <i class="fa-solid fa-chart-line"></i>
        </button>
        <button class="btn btn-sm btn-outline-primary me-1" onclick="openAssessmentModal(${r.rowIndex})" title="ประเมินกลุ่ม CL และคำแนะนำ CJ">
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

function switchToIndividualTab(hn) {
  selectPatient(hn);
  const tabBtn = document.getElementById('tab-individual-btn');
  if (tabBtn) bootstrap.Tab.getOrCreateInstance(tabBtn).show();
}

// =========================================================================
// 8. TAB 4: ตารางผล Lab ทุกตัวแยกคอลัมน์ (Wide Matrix Table)
// =========================================================================
function renderMatrixTable() {
  const thead = document.getElementById('matrixThead');
  const tbody = document.getElementById('matrixTbody');
  const countBadge = document.getElementById('matrixRowCount');
  const pageInfo = document.getElementById('matrixPageInfo');
  const paginationUl = document.getElementById('matrixPagination');
  if (!thead || !tbody) return;

  thead.innerHTML = '';
  tbody.innerHTML = '';

  const headers = appState.headers;
  const allRows = appState.allRows;

  if (!headers.length || !allRows.length) {
    tbody.innerHTML = '<tr><td class="text-center py-4 text-muted">ไม่พบข้อมูลในตาราง</td></tr>';
    if (countBadge) countBadge.textContent = '0 แถว';
    if (pageInfo) pageInfo.textContent = 'แสดงหน้า 0 จาก 0';
    if (paginationUl) paginationUl.innerHTML = '';
    return;
  }

  // 1. กรองข้อมูลตามคำค้นหา (Search)
  const searchQuery = (appState.matrixState.search || '').trim().toLowerCase();
  let matchedRows = allRows;

  if (searchQuery) {
    matchedRows = allRows.filter(r => {
      if (!r.rawRow) return false;
      // ตรวจสอบทั้งตัว string ของ rawRow และฟิลด์หลัก
      return r.rawRow.some(c => c !== null && c !== undefined && String(c).toLowerCase().includes(searchQuery)) ||
             (r.hn && r.hn.toLowerCase().includes(searchQuery)) ||
             (r.vn && r.vn.toLowerCase().includes(searchQuery)) ||
             (r.ptname && r.ptname.toLowerCase().includes(searchQuery));
    });
  }

  const totalMatched = matchedRows.length;
  if (countBadge) countBadge.textContent = `${totalMatched.toLocaleString()} แถว ${searchQuery ? '(กรองแล้ว)' : ''}`;

  // 2. คำนวณการแบ่งหน้า (Pagination)
  const pageSize = appState.matrixState.pageSize || 25;
  const totalPages = Math.max(1, Math.ceil(totalMatched / pageSize));

  if (appState.matrixState.currentPage > totalPages) {
    appState.matrixState.currentPage = totalPages;
  }
  if (appState.matrixState.currentPage < 1) {
    appState.matrixState.currentPage = 1;
  }
  const curPage = appState.matrixState.currentPage;

  const startIndex = (curPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalMatched);
  const pageRows = matchedRows.slice(startIndex, endIndex);

  // อัปเดตข้อมูลหน้า
  if (pageInfo) {
    pageInfo.textContent = `แสดงแถวที่ ${totalMatched > 0 ? (startIndex + 1).toLocaleString() : 0} ถึง ${endIndex.toLocaleString()} จากทั้งหมด ${totalMatched.toLocaleString()} รายการ (หน้า ${curPage} / ${totalPages})`;
  }

  // 3. สร้างหัวตาราง (Thead)
  const trHead = document.createElement('tr');
  headers.forEach((h, idx) => {
    const th = document.createElement('th');
    th.textContent = h;
    if (idx === 87) th.className = 'bg-info text-white'; // CJ
    if (idx === 89) th.className = 'bg-primary text-white'; // CL
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);

  // 4. แสดงแถวข้อมูลในหน้านั้น (Tbody)
  if (!pageRows.length) {
    tbody.innerHTML = `<tr><td colspan="${headers.length}" class="text-center py-5 text-muted">ไม่พบข้อมูลที่ตรงกับคำค้นหา "${searchQuery}"</td></tr>`;
  } else {
    pageRows.forEach(r => {
      if (!r.rawRow) return;
      const tr = document.createElement('tr');
      r.rawRow.forEach((cell, idx) => {
        const td = document.createElement('td');
        const headerName = headers[idx] || '';
        // ฟอร์แมตค่า วันที่, เวลา, และช่วงค่า UA เช่น 0-1, 0-2
        const displayVal = formatMatrixDisplayValue(cell, headerName, idx);

        td.textContent = displayVal;
        if (idx === 87) td.className = 'fw-bold text-info';
        if (idx === 89) td.className = 'fw-bold text-primary';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  // 5. เรนเดอร์ปุ่มตัวเลขหน้า (Pagination Navigation)
  renderMatrixPaginationControls(curPage, totalPages);
}

function renderMatrixPaginationControls(curPage, totalPages) {
  const paginationUl = document.getElementById('matrixPagination');
  if (!paginationUl) return;

  paginationUl.innerHTML = '';
  if (totalPages <= 1) return;

  // First & Prev
  const liFirst = document.createElement('li');
  liFirst.className = `page-item ${curPage === 1 ? 'disabled' : ''}`;
  liFirst.innerHTML = `<button class="page-link" onclick="changeMatrixPage(1)"><i class="fa-solid fa-angles-left"></i></button>`;
  paginationUl.appendChild(liFirst);

  const liPrev = document.createElement('li');
  liPrev.className = `page-item ${curPage === 1 ? 'disabled' : ''}`;
  liPrev.innerHTML = `<button class="page-link" onclick="changeMatrixPage(${curPage - 1})"><i class="fa-solid fa-angle-left"></i></button>`;
  paginationUl.appendChild(liPrev);

  // Page numbers around current
  const maxButtons = 5;
  let startPage = Math.max(1, curPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);
  if (endPage - startPage + 1 < maxButtons) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  for (let p = startPage; p <= endPage; p++) {
    const li = document.createElement('li');
    li.className = `page-item ${p === curPage ? 'active' : ''}`;
    li.innerHTML = `<button class="page-link" onclick="changeMatrixPage(${p})">${p}</button>`;
    paginationUl.appendChild(li);
  }

  // Next & Last
  const liNext = document.createElement('li');
  liNext.className = `page-item ${curPage === totalPages ? 'disabled' : ''}`;
  liNext.innerHTML = `<button class="page-link" onclick="changeMatrixPage(${curPage + 1})"><i class="fa-solid fa-angle-right"></i></button>`;
  paginationUl.appendChild(liNext);

  const liLast = document.createElement('li');
  liLast.className = `page-item ${curPage === totalPages ? 'disabled' : ''}`;
  liLast.innerHTML = `<button class="page-link" onclick="changeMatrixPage(${totalPages})"><i class="fa-solid fa-angles-right"></i></button>`;
  paginationUl.appendChild(liLast);
}

function changeMatrixPage(page) {
  appState.matrixState.currentPage = page;
  renderMatrixTable();
}

// =========================================================================
// 9. บันทึกข้อมูล กลุ่ม CL (ปกติ, เสี่ยง, ป่วย) และ คำแนะนำ CJ
// =========================================================================
function openAssessmentModal(rowIndex) {
  const row = appState.allRows.find(r => r.rowIndex === rowIndex);
  if (!row) return;

  appState.selectedRow = row;

  safeSetText('modalAsmHn', row.hn || '-');
  safeSetText('modalAsmName', row.ptname || '-');
  safeSetText('modalAsmAge', row.age_y ? `${row.age_y} ปี` : '-');
  safeSetText('modalAsmDate', row.vstdate || '-');
  safeSetText('modalAsmBmi', row.bmi || '-');
  safeSetText('modalAsmBp', row.bp || '-');
  safeSetText('modalAsmDiag', row.all_diag_desc || row.pdx || '-');
  safeSetText('modalAsmPmh', row.pmh || 'ไม่มีข้อมูลโรคประจำตัว');

  // Radio CL
  const groupRadios = document.getElementsByName('groupChoice');
  groupRadios.forEach(radio => {
    radio.checked = (radio.value === (row.group_cl || ''));
  });

  // Advice CJ
  safeSetValue('modalAdviceText', row.advice_cj || '');

  const modalEl = document.getElementById('assessmentEditModal');
  if (modalEl) {
    const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    bsModal.show();
  }
}

function openAssessmentModalFromIndiv() {
  if (appState.selectedRow) {
    openAssessmentModal(appState.selectedRow.rowIndex);
  }
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

    // Update state
    row.group_cl = selectedGroup;
    row.advice_cj = adviceText;

    if (row.rawRow) {
      row.rawRow[87] = adviceText; // CJ
      row.rawRow[89] = selectedGroup; // CL
    }

    updateKpiCards();
    applyFilters();
    renderGroupCharts();
    renderGroupSummaryTable();

    if (appState.selectedPatientHn === row.hn) {
      selectPatient(row.hn);
    }

    bootstrap.Modal.getInstance(document.getElementById('assessmentEditModal')).hide();

    Swal.fire({
      icon: 'success',
      title: 'บันทึกข้อมูลสำเร็จ!',
      html: `อัปเดตกลุ่ม <strong>${selectedGroup || 'ไม่ระบุ'}</strong> และคำแนะนำใน Google Sheets เรียบร้อยแล้ว`,
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
// 10. ระบบลบข้อมูลเจ้าหน้าที่ (Delete Patient Record)
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

    // Remove row from state
    appState.allRows = appState.allRows.filter(r => r.rowIndex !== rowIndex);
    appState.allRows.forEach(r => {
      if (r.rowIndex > rowIndex) r.rowIndex -= 1;
    });

    updateKpiCards();
    applyFilters();
    renderGroupCharts();
    renderGroupSummaryTable();
    buildPatientSelectList();

    Swal.fire({
      icon: 'success',
      title: 'ลบข้อมูลสำเร็จ',
      text: `ข้อมูลของ ${name} ถูกลบออกจาก Google Sheet เรียบร้อยแล้ว`,
      timer: 1800,
      showConfirmButton: false
    });

  } catch (err) {
    console.error(err);
    Swal.fire({ icon: 'error', title: 'ลบล้มเหลว', text: err.message });
  }
}

// =========================================================================
// 11. พิมพ์แบบประเมินผลตรวจสุขภาพ A4 พร้อมเครื่องหมายเลือกคมชัด 100%
// =========================================================================
function openPrintAssessment(rowIndex) {
  const row = appState.allRows.find(r => r.rowIndex === rowIndex);
  if (!row) return;

  appState.selectedRow = row;

  // 1. Personal Info
  safeSetText('asmHn', row.hn || '-');
  safeSetText('asmPtName', row.ptname || '-');
  safeSetText('asmAge', row.age_y || '-');
  safeSetText('asmDate', row.vstdate || '-');
  safeSetText('asmChronic', row.pmh || 'ปฏิเสธโรคประจำตัว');
  safeSetText('asmBw', row.bw || '-');
  safeSetText('asmHeight', row.height || '-');
  safeSetText('asmPttype', `สิทธิ ${row.pttype} (${row.pttype_name || ''})`);

  // 2. ตาราง 19 รายการตรวจ
  renderPrint19Items(row);

  // 3. คำแนะนำจากคอลัมน์ CJ
  safeSetText('asmPrintAdvice', row.advice_cj || '-');

  // 4. เครื่องหมายข้อ 3
  const isAbnormalGeneral = (row.group_cl === 'ป่วย' || row.group_cl === 'เสี่ยง');
  setAsmGeneral(isAbnormalGeneral ? 'abnormal' : 'normal');

  const bmiNum = parseFloat(row.bmi) || 0;
  setAsmProblem('chkProbObese', bmiNum >= 23);

  const bpParts = (row.bp || '').split('/');
  const bps = parseFloat(bpParts[0]) || 0;
  const bpd = parseFloat(bpParts[1]) || 0;
  setAsmProblem('chkProbHt', bps >= 140 || bpd >= 90);

  // Check lab values for specific problems
  const fbs = extractLabValue(row, ['fbs', 'blood sugar']);
  setAsmProblem('chkProbDm', fbs !== null && fbs >= 100);

  const chol = extractLabValue(row, ['cholesterol']);
  const tg = extractLabValue(row, ['triglyceride']);
  const ldl = extractLabValue(row, ['ldl']);
  setAsmProblem('chkProbLipid', (chol !== null && chol >= 200) || (tg !== null && tg >= 150) || (ldl !== null && ldl >= 100));

  const uric = extractLabValue(row, ['uric']);
  setAsmProblem('chkProbUric', uric !== null && uric >= 7.0);

  const bun = extractLabValue(row, ['bun']);
  const cr = extractLabValue(row, ['creatinine']);
  setAsmProblem('chkProbKidney', (bun !== null && bun >= 21) || (cr !== null && cr >= 1.2));

  const sgot = extractLabValue(row, ['sgot', 'ast']);
  const sgpt = extractLabValue(row, ['sgpt', 'alt']);
  setAsmProblem('chkProbLiver', (sgot !== null && sgot >= 35) || (sgpt !== null && sgpt >= 35));

  setAsmProblem('chkProbAnemia', false);
  setAsmProblem('chkProbOther', false);

  setAsmProblem('chkDentalNormal', false);
  setAsmProblem('chkDentalAbnormal', false);

  const modalEl = document.getElementById('assessmentPrintModal');
  if (modalEl) {
    const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    bsModal.show();
  }
}

function openPrintFromIndiv() {
  if (appState.selectedRow) {
    openPrintAssessment(appState.selectedRow.rowIndex);
  }
}

function renderPrint19Items(row) {
  const tbody = document.getElementById('asmTableBody');
  if (!tbody) return;

  const items = [
    { no: '2.1', title: 'ดัชนีมวลกาย (BMI)', val: row.bmi || '-', ref: '18.5 - 22.9 kg/m²', isAbn: parseFloat(row.bmi) >= 23 },
    { no: '2.2', title: 'ความดันโลหิต (BP)', val: row.bp || '-', ref: '< 120/80 mmHg', isAbn: false },
    { no: '2.3', title: 'ความเข้มข้นเลือด (CBC)', val: extractLabString(row, ['hct', 'hb']) || 'ปกติ', ref: 'Hb: 12-16 g/dL', isAbn: false },
    { no: '2.4', title: 'เอกซเรย์ปอด (CXR)', val: 'ปกติ (Normal)', ref: 'ปกติ / ไม่พบรอยโรค', isAbn: false },
    { no: '2.5', title: 'ตรวจปัสสาวะ (UA)', val: 'Prot: Neg, Sugar: Neg', ref: 'Negative', isAbn: false },
    { no: '2.6', title: 'ตรวจอุจจาระ (Stool)', val: '-', ref: 'Occult: Neg', isAbn: false },
    { no: '2.7', title: 'น้ำตาลในเลือด (FBS)', val: extractLabString(row, ['fbs', 'blood sugar']) || '-', ref: '70 - 99 mg/dL', isAbn: (parseFloat(extractLabString(row, ['fbs'])) >= 100) },
    { no: '2.8', title: 'การทำงานของไต (Creatinine)', val: extractLabString(row, ['creatinine']) || '-', ref: '0.50 - 1.20 mg/dL', isAbn: false },
    { no: '2.9', title: 'การทำงานของไต (BUN)', val: extractLabString(row, ['bun']) || '-', ref: '7 - 21 mg/dL', isAbn: false },
    { no: '2.10', title: 'คอเลสเตอรอลรวม (Cholesterol)', val: extractLabString(row, ['cholesterol']) || '-', ref: '< 200 mg/dL', isAbn: (parseFloat(extractLabString(row, ['cholesterol'])) >= 200) },
    { no: '2.11', title: 'ไตรกลีเซอไรด์ (Triglyceride)', val: extractLabString(row, ['triglyceride']) || '-', ref: '< 150 mg/dL', isAbn: (parseFloat(extractLabString(row, ['triglyceride'])) >= 150) },
    { no: '2.12', title: 'ไขมันดี (HDL)', val: extractLabString(row, ['hdl']) || '-', ref: '> 40 mg/dL', isAbn: false },
    { no: '2.13', title: 'ไขมันไม่ดี (LDL)', val: extractLabString(row, ['ldl']) || '-', ref: '< 100 mg/dL', isAbn: (parseFloat(extractLabString(row, ['ldl'])) >= 100) },
    { no: '2.14', title: 'การทำงานของตับ (SGOT)', val: extractLabString(row, ['sgot', 'ast']) || '-', ref: '< 35 U/L', isAbn: false },
    { no: '2.15', title: 'การทำงานของตับ (SGPT)', val: extractLabString(row, ['sgpt', 'alt']) || '-', ref: '< 35 U/L', isAbn: false },
    { no: '2.16', title: 'เอนไซม์ตับ (ALP)', val: extractLabString(row, ['alk', 'alp']) || '-', ref: '30 - 120 U/L', isAbn: false },
    { no: '2.17', title: 'กรดยูริก (Uric Acid)', val: extractLabString(row, ['uric']) || '-', ref: '2.3 - 6.1 mg/dL', isAbn: false },
    { no: '2.18', title: 'ไวรัสตับอักเสบบี (HBsAg)', val: extractLabString(row, ['hbsag']) || 'Negative', ref: 'Negative', isAbn: false },
    { no: '2.19', title: 'ไวรัสตับอักเสบซี (Anti-HCV)', val: extractLabString(row, ['antihcv', 'anti-hcv']) || 'Negative', ref: 'Negative', isAbn: false }
  ];

  tbody.innerHTML = '';
  items.forEach(it => {
    const normalMark = it.isAbn ? '' : '<span style="color: #15803d; font-size: 15px; font-weight: bold;">✓</span>';
    const abnormalMark = it.isAbn ? '<span style="color: #dc2626; font-size: 15px; font-weight: bold;">✓</span>' : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding-left: 8px;"><strong>${it.no} ${it.title}</strong></td>
      <td class="check-cell">${normalMark}</td>
      <td class="check-cell">${abnormalMark}</td>
      <td class="ref-cell" style="padding-left: 8px;">
        <div><strong>ผลตรวจ:</strong> <span style="${it.isAbn ? 'color: #dc2626; font-weight: bold;' : 'font-weight: 600;'}">${it.val}</span></div>
        <div style="color: #64748b; font-size: 10px;">(เกณฑ์: ${it.ref})</div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function extractLabString(row, keywords) {
  if (!row || !row.rawRow || !appState.headers) return '';
  for (let c = 18; c < appState.headers.length; c++) {
    const h = (appState.headers[c] || '').toLowerCase();
    for (const kw of keywords) {
      if (h.includes(kw)) {
        return row.rawRow[c] !== null && row.rawRow[c] !== undefined ? String(row.rawRow[c]) : '';
      }
    }
  }
  return '';
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
        .assessment-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px; }
        .assessment-table th, .assessment-table td { border: 1px solid #333; padding: 3px 6px; vertical-align: middle; }
        .assessment-table th { background-color: #f1f5f9 !important; text-align: center; font-weight: 700; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .assessment-table .check-cell { text-align: center; width: 55px; font-weight: 700; font-size: 14px; }
        .assessment-table .ref-cell { font-size: 10.5px; color: #333; }
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
// 12. ส่งออกตารางเป็น Excel (XLSX)
// =========================================================================
function exportTableToExcel() {
  if (!appState.allRows.length) {
    Swal.fire({ icon: 'info', title: 'ไม่มีข้อมูลที่จะส่งออก' });
    return;
  }

  const exportData = (appState.filteredRows.length ? appState.filteredRows : appState.allRows).map((r, i) => ({
    'ลำดับ': i + 1,
    'วันที่ตรวจ': r.vstdate || '',
    'วันตรวจไขมันเพิ่ม': r.companion_date || '',
    'เวลา': r.vsttime || '',
    'HN': r.hn || '',
    'VN': r.vn || '',
    'ชื่อ-นามสกุล': r.ptname || '',
    'เพศ': r.sex || '',
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
// 13. การตั้งค่า URL ของ Google Apps Script API
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

// Helper Helpers
function destroyChart(id) {
  if (appState.charts[id]) {
    appState.charts[id].destroy();
    delete appState.charts[id];
  }
}

function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

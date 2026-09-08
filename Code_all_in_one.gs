/**
 * =========================================================================
 * Code_all_in_one.gs - ไฟล์รวมทั้งหมดสำหรับ Google Apps Script (แบบไฟล์เดียว)
 * โรงพยาบาลไทรโยค - ระบบตรวจสุขภาพประจำปีเจ้าหน้าที่
 * Sheet ID: 1ejjut45lXZ-G-qxpkAbmGVGk5JhcwZ8CGyA46Bx_w4k
 * Tab Name: data
 * =========================================================================
 * หากท่านต้องการวางโค้ดใน Apps Script เพียงไฟล์เดียว สามารถคัดลอกไฟล์นี้ไปวางได้เลยครับ
 * =========================================================================
 */

// =========================================================================
// ส่วนที่ 1: การยืนยันตัวตนและการรักษาความปลอดภัย (Auth)
// =========================================================================
const AUTH_CONFIG = {
  USERNAME: 'admin11278',
  PASSWORD: 'admin11278',
  TOKEN_SECRET: 'Saiyok_Healthcheckup_SecretKey_2026',
  TOKEN_EXPIRY_HOURS: 72 // อายุ Token 3 วัน
};

function authenticateUser(username, password) {
  if (!username || !password) {
    return { success: false, message: 'กรุณาระบุชื่อผู้ใช้และรหัสผ่าน' };
  }
  const cleanUser = String(username).trim();
  const cleanPass = String(password).trim();

  if (cleanUser === AUTH_CONFIG.USERNAME && cleanPass === AUTH_CONFIG.PASSWORD) {
    const token = generateAuthToken(cleanUser);
    return {
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      user: {
        username: cleanUser,
        role: 'admin',
        displayName: 'ผู้ดูแลระบบ รพ.ไทรโยค'
      },
      token: token
    };
  }
  return { success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
}

function generateAuthToken(username) {
  const expiresAt = new Date().getTime() + (AUTH_CONFIG.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  const rawData = `${username}:${expiresAt}`;
  const signatureBytes = Utilities.computeHmacSha256Signature(rawData, AUTH_CONFIG.TOKEN_SECRET);
  const signature = Utilities.base64Encode(signatureBytes);
  const tokenPayload = `${rawData}:${signature}`;
  return Utilities.base64Encode(tokenPayload);
}

function validateAuthToken(token) {
  if (!token) return false;
  try {
    const decoded = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString();
    const parts = decoded.split(':');
    if (parts.length !== 3) return false;

    const username = parts[0];
    const expiresAt = parseInt(parts[1], 10);
    const signature = parts[2];

    if (new Date().getTime() > expiresAt) return false;

    const rawData = `${username}:${expiresAt}`;
    const expectedSigBytes = Utilities.computeHmacSha256Signature(rawData, AUTH_CONFIG.TOKEN_SECRET);
    const expectedSignature = Utilities.base64Encode(expectedSigBytes);

    return signature === expectedSignature && username === AUTH_CONFIG.USERNAME;
  } catch (err) {
    return false;
  }
}

// =========================================================================
// ส่วนที่ 2: ระบบจัดการ Google Sheets (CRUD & Web App API)
// =========================================================================
const DEFAULT_SHEET_ID = '1ejjut45lXZ-G-qxpkAbmGVGk5JhcwZ8CGyA46Bx_w4k';
const DEFAULT_SHEET_NAME = 'data';

const COL_INDEX = {
  DATE: 1,         // A: วันที่ตรวจ
  COMP_DATE: 2,    // B: วันตรวจไขมันเพิ่ม
  TIME: 3,         // C: เวลา
  HN: 4,           // D: HN
  VN: 5,           // E: VN
  NAME: 6,         // F: ชื่อ-นามสกุล
  SEX: 7,          // G: เพศ
  AGE: 8,          // H: อายุ (ปี)
  PTTYPE: 9,       // I: รหัสสิทธิ
  PTTYPE_NAME: 10, // J: ชื่อสิทธิ
  DX: 11,          // K: DX ICD10
  DIAG_DESC: 12,   // L: รายละเอียดการวินิจฉัย
  PMH: 13,         // M: โรคประจำตัว (PMH)
  BW: 14,          // N: น้ำหนัก
  HEIGHT: 15,      // O: ส่วนสูง
  BMI: 16,         // P: BMI
  BP: 17,          // Q: ความดัน
  PULSE: 18,       // R: ชีพจร
  ADVICE: 88,      // CJ: คำแนะนำ
  GROUP: 90        // CL: กลุ่ม (ปกติ, เสี่ยง, ป่วย)
};

function doGet(e) {
  try {
    const params = e ? e.parameter || {} : {};
    const action = params.action || 'ping';

    if (action === 'ping') {
      return jsonResponse({
        status: 'active',
        message: 'ระบบ API ตรวจสุขภาพเจ้าหน้าที่ รพ.ไทรโยค พร้อมทำงาน',
        sheet_id: DEFAULT_SHEET_ID,
        sheet_name: DEFAULT_SHEET_NAME,
        timestamp: new Date().toISOString()
      });
    }

    if (action === 'login') {
      const authResult = authenticateUser(params.username, params.password);
      return jsonResponse(authResult);
    }

    if (action === 'verify_token') {
      const isValid = validateAuthToken(params.token);
      return jsonResponse({
        success: isValid,
        message: isValid ? 'Token ถูกต้อง' : 'Token หมดอายุหรือไม่ถูกต้อง'
      });
    }

    if (action === 'get_data') {
      const token = params.token || '';
      if (!validateAuthToken(token)) {
        return jsonResponse({
          success: false,
          require_login: true,
          message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน (Token ไม่ถูกต้องหรือหมดอายุ)'
        });
      }

      const sheetData = fetchSheetData(params.sheet_id || DEFAULT_SHEET_ID, params.sheet_name || DEFAULT_SHEET_NAME);
      return jsonResponse(sheetData);
    }

    return jsonResponse({
      status: 'error',
      message: `ไม่รู้จักคำสั่ง action: ${action}`
    });

  } catch (err) {
    return jsonResponse({
      status: 'error',
      message: err.toString()
    });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(20000)) {
      return jsonResponse({
        status: 'error',
        message: 'ระบบกำลังประมวลผลคำขอก่อนหน้า กรุณาลองใหม่ในอีกสักครู่'
      });
    }

    let payload = {};
    if (e && e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (ex) {
        payload = e.parameter || {};
      }
    } else if (e && e.parameter) {
      payload = e.parameter;
    }

    const action = payload.action || 'append_healthcheckup_data';
    const sheetId = payload.sheet_id || DEFAULT_SHEET_ID;
    const sheetName = payload.sheet_name || DEFAULT_SHEET_NAME;

    if (action === 'login') {
      const authResult = authenticateUser(payload.username, payload.password);
      return jsonResponse(authResult);
    }

    if (action === 'update_assessment') {
      const token = payload.token || '';
      if (!validateAuthToken(token)) {
        return jsonResponse({
          success: false,
          require_login: true,
          message: 'สิทธิ์การใช้งานหมดอายุ กรุณาเข้าสู่ระบบใหม่'
        });
      }

      const result = updateAssessmentRecord(sheetId, sheetName, payload);
      return jsonResponse(result);
    }

    if (action === 'delete_patient') {
      const token = payload.token || '';
      if (!validateAuthToken(token)) {
        return jsonResponse({
          success: false,
          require_login: true,
          message: 'สิทธิ์การใช้งานหมดอายุ กรุณาเข้าสู่ระบบใหม่'
        });
      }

      const result = deletePatientRecord(sheetId, sheetName, payload);
      return jsonResponse(result);
    }

    if (action === 'append_healthcheckup_data') {
      const result = appendHealthData(sheetId, sheetName, payload.rows || []);
      return jsonResponse(result);
    }

    return jsonResponse({
      status: 'error',
      message: `ไม่รู้จักคำสั่ง POST action: ${action}`
    });

  } catch (err) {
    return jsonResponse({
      status: 'error',
      message: err.toString()
    });
  } finally {
    lock.releaseLock();
  }
}

function fetchSheetData(sheetId, sheetName) {
  const ss = SpreadsheetApp.openById(sheetId);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return { success: true, headers: [], rows: [], stats: {} };
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow <= 1) {
    return {
      success: true,
      headers: lastRow === 1 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [],
      rows: [],
      stats: { total: 0, normal: 0, risk: 0, sick: 0, unassessed: 0, has_advice: 0 }
    };
  }

  ensureAssessmentHeaders(sheet);

  const fullLastCol = Math.max(sheet.getLastColumn(), COL_INDEX.GROUP);
  const dataRange = sheet.getRange(1, 1, lastRow, fullLastCol);
  const values = dataRange.getValues();

  const headers = values[0];
  const rows = [];

  let countNormal = 0;
  let countRisk = 0;
  let countSick = 0;
  let countUnassessed = 0;
  let countHasAdvice = 0;

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const hn = String(row[COL_INDEX.HN - 1] || '').trim();
    const vn = String(row[COL_INDEX.VN - 1] || '').trim();
    const name = String(row[COL_INDEX.NAME - 1] || '').trim();

    if (!hn && !vn && !name) continue;

    const groupVal = String(row[COL_INDEX.GROUP - 1] || '').trim();
    const adviceVal = String(row[COL_INDEX.ADVICE - 1] || '').trim();

    if (groupVal === 'ปกติ') countNormal++;
    else if (groupVal === 'เสี่ยง') countRisk++;
    else if (groupVal === 'ป่วย') countSick++;
    else countUnassessed++;

    if (adviceVal) countHasAdvice++;

    rows.push({
      rowIndex: r + 1,
      vstdate: formatCellValue(row[COL_INDEX.DATE - 1]),
      companion_date: formatCellValue(row[COL_INDEX.COMP_DATE - 1]),
      vsttime: formatCellValue(row[COL_INDEX.TIME - 1]),
      hn: hn,
      vn: vn,
      ptname: name,
      sex: formatCellValue(row[COL_INDEX.SEX - 1]),
      age_y: formatCellValue(row[COL_INDEX.AGE - 1]),
      pttype: formatCellValue(row[COL_INDEX.PTTYPE - 1]),
      pttype_name: formatCellValue(row[COL_INDEX.PTTYPE_NAME - 1]),
      pdx: formatCellValue(row[COL_INDEX.DX - 1]),
      all_diag_desc: formatCellValue(row[COL_INDEX.DIAG_DESC - 1]),
      pmh: formatCellValue(row[COL_INDEX.PMH - 1]),
      bw: formatCellValue(row[COL_INDEX.BW - 1]),
      height: formatCellValue(row[COL_INDEX.HEIGHT - 1]),
      bmi: formatCellValue(row[COL_INDEX.BMI - 1]),
      bp: formatCellValue(row[COL_INDEX.BP - 1]),
      pulse: formatCellValue(row[COL_INDEX.PULSE - 1]),
      advice_cj: adviceVal,
      group_cl: groupVal,
      rawRow: row
    });
  }

  return {
    success: true,
    sheet_id: sheetId,
    sheet_name: sheetName,
    headers: headers,
    total_rows: rows.length,
    stats: {
      total: rows.length,
      normal: countNormal,
      risk: countRisk,
      sick: countSick,
      unassessed: countUnassessed,
      has_advice: countHasAdvice
    },
    rows: rows
  };
}

function updateAssessmentRecord(sheetId, sheetName, payload) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return { success: false, message: `ไม่พบแท็บชีต ${sheetName}` };
  }

  ensureAssessmentHeaders(sheet);

  let targetRowIndex = parseInt(payload.rowIndex, 10);
  const targetHn = String(payload.hn || '').trim();
  const targetVn = String(payload.vn || '').trim();

  if (!targetRowIndex || targetRowIndex < 2) {
    const lastRow = sheet.getLastRow();
    const vnColVals = sheet.getRange(1, COL_INDEX.VN, lastRow, 1).getValues();
    const hnColVals = sheet.getRange(1, COL_INDEX.HN, lastRow, 1).getValues();

    for (let i = 1; i < lastRow; i++) {
      const curVn = String(vnColVals[i][0] || '').trim();
      const curHn = String(hnColVals[i][0] || '').trim();
      if ((targetVn && curVn === targetVn) || (targetHn && curHn === targetHn)) {
        targetRowIndex = i + 1;
        break;
      }
    }
  }

  if (!targetRowIndex || targetRowIndex < 2 || targetRowIndex > sheet.getLastRow()) {
    return { success: false, message: `ไม่พบแถวข้อมูลของ HN: ${targetHn} หรือ VN: ${targetVn}` };
  }

  const newGroup = String(payload.group || '').trim();
  const newAdvice = String(payload.advice || '').trim();

  sheet.getRange(targetRowIndex, COL_INDEX.ADVICE).setValue(newAdvice);
  sheet.getRange(targetRowIndex, COL_INDEX.GROUP).setValue(newGroup);

  const groupCell = sheet.getRange(targetRowIndex, COL_INDEX.GROUP);
  if (newGroup === 'ปกติ') {
    groupCell.setBackground('#E6FFFA').setFontColor('#234E52').setFontWeight('bold');
  } else if (newGroup === 'เสี่ยง') {
    groupCell.setBackground('#FEFCBF').setFontColor('#744210').setFontWeight('bold');
  } else if (newGroup === 'ป่วย') {
    groupCell.setBackground('#FED7D7').setFontColor('#742A2A').setFontWeight('bold');
  } else {
    groupCell.setBackground('#FFFFFF').setFontColor('#000000').setFontWeight('normal');
  }

  return {
    success: true,
    message: 'บันทึกกลุ่มและคำแนะนำเรียบร้อยแล้ว',
    rowIndex: targetRowIndex,
    hn: targetHn,
    vn: targetVn,
    group: newGroup,
    advice: newAdvice,
    updated_at: Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd HH:mm:ss')
  };
}

function deletePatientRecord(sheetId, sheetName, payload) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return { success: false, message: `ไม่พบแท็บชีต ${sheetName}` };
  }

  let targetRowIndex = parseInt(payload.rowIndex, 10);
  const targetHn = String(payload.hn || '').trim();
  const targetVn = String(payload.vn || '').trim();

  if (!targetRowIndex || targetRowIndex < 2) {
    const lastRow = sheet.getLastRow();
    const vnColVals = sheet.getRange(1, COL_INDEX.VN, lastRow, 1).getValues();
    const hnColVals = sheet.getRange(1, COL_INDEX.HN, lastRow, 1).getValues();

    for (let i = 1; i < lastRow; i++) {
      const curVn = String(vnColVals[i][0] || '').trim();
      const curHn = String(hnColVals[i][0] || '').trim();
      if ((targetVn && curVn === targetVn) || (targetHn && curHn === targetHn)) {
        targetRowIndex = i + 1;
        break;
      }
    }
  }

  if (!targetRowIndex || targetRowIndex < 2 || targetRowIndex > sheet.getLastRow()) {
    return { success: false, message: `ไม่พบแถวข้อมูลที่จะลบ (HN: ${targetHn}, VN: ${targetVn})` };
  }

  sheet.deleteRow(targetRowIndex);

  return {
    success: true,
    message: `ลบข้อมูลแถวที่ ${targetRowIndex} เรียบร้อยแล้ว`,
    deleted_row: targetRowIndex,
    deleted_hn: targetHn,
    deleted_vn: targetVn
  };
}

function appendHealthData(sheetId, sheetName, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { status: 'empty', message: 'ไม่มีแถวข้อมูลที่ต้องบันทึก' };
  }

  const ss = SpreadsheetApp.openById(sheetId);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0 && rows.length > 0) {
    sheet.appendRow(rows[0]);
    sheet.getRange(1, 1, 1, rows[0].length).setFontWeight('bold').setBackground('#0f766e').setFontColor('#FFFFFF');
    rows.shift();
  }

  ensureAssessmentHeaders(sheet);

  const formattedRows = rows.map(row => {
    return row.map(cell => (cell === null || cell === undefined) ? '' : String(cell));
  });

  if (formattedRows.length > 0) {
    const startRow = sheet.getLastRow() + 1;
    const numRows = formattedRows.length;
    const numCols = formattedRows[0].length;
    sheet.getRange(startRow, 1, numRows, numCols).setValues(formattedRows);
  }

  return {
    status: 'success',
    message: 'บันทึกข้อมูลเรียบร้อยแล้ว',
    added_rows: formattedRows.length,
    timestamp: Utilities.formatDate(new Date(), 'GMT+7', 'yyyy-MM-dd HH:mm:ss')
  };
}

function ensureAssessmentHeaders(sheet) {
  try {
    const cjHeader = sheet.getRange(1, COL_INDEX.ADVICE).getValue();
    if (!cjHeader || String(cjHeader).trim() === '') {
      sheet.getRange(1, COL_INDEX.ADVICE).setValue('คำแนะนำ').setFontWeight('bold').setBackground('#0369a1').setFontColor('#FFFFFF');
    }

    const clHeader = sheet.getRange(1, COL_INDEX.GROUP).getValue();
    if (!clHeader || String(clHeader).trim() === '') {
      sheet.getRange(1, COL_INDEX.GROUP).setValue('กลุ่ม').setFontWeight('bold').setBackground('#0369a1').setFontColor('#FFFFFF');
    }
  } catch (err) {
    // Ignore header check errors
  }
}

function formatCellValue(val) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'GMT+7', 'yyyy-MM-dd');
  }
  return String(val);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

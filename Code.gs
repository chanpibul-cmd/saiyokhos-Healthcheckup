/**
 * =========================================================================
 * Code.gs - ระบบหลังบ้าน Google Apps Script เชื่อมต่อ Google Sheets
 * โรงพยาบาลไทรโยค - ระบบตรวจสุขภาพประจำปีเจ้าหน้าที่
 * Sheet ID: 1ejjut45lXZ-G-qxpkAbmGVGk5JhcwZ8CGyA46Bx_w4k
 * Tab Name: data
 * =========================================================================
 * คอลัมน์สำคัญที่ระบบจัดการ:
 * - คอลัมน์ CJ (ลำดับที่ 88): "คำแนะนำ"
 * - คอลัมน์ CL (ลำดับที่ 90): "กลุ่ม" (ปกติ, เสี่ยง, ป่วย)
 * =========================================================================
 */

const DEFAULT_SHEET_ID = '1ejjut45lXZ-G-qxpkAbmGVGk5JhcwZ8CGyA46Bx_w4k';
const DEFAULT_SHEET_NAME = 'data';

// ตำแหน่งคอลัมน์มาตรฐาน
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

/**
 * จัดการคำขอแบบ HTTP GET
 */
function doGet(e) {
  try {
    const params = e ? e.parameter || {} : {};
    const action = params.action || 'ping';

    // 1. ตรวจสอบสถานะการเชื่อมต่อ (Ping)
    if (action === 'ping') {
      return jsonResponse({
        status: 'active',
        message: 'ระบบ API ตรวจสุขภาพเจ้าหน้าที่ รพ.ไทรโยค พร้อมทำงาน',
        sheet_id: DEFAULT_SHEET_ID,
        sheet_name: DEFAULT_SHEET_NAME,
        timestamp: new Date().toISOString()
      });
    }

    // 2. ตรวจสอบการเข้าสู่ระบบ (Login via GET สำหรับทดสอบหรือเชื่อมต่อสะดวก)
    if (action === 'login') {
      const authResult = authenticateUser(params.username, params.password);
      return jsonResponse(authResult);
    }

    // 3. ตรวจสอบ Token
    if (action === 'verify_token') {
      const isValid = validateAuthToken(params.token);
      return jsonResponse({
        success: isValid,
        message: isValid ? 'Token ถูกต้อง' : 'Token หมดอายุหรือไม่ถูกต้อง'
      });
    }

    // 4. ดึงข้อมูลทั้งหมดจาก Google Sheet (Get Data)
    if (action === 'get_data') {
      // ตรวจสอบ Token เพื่อความปลอดภัย
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

/**
 * จัดการคำขอแบบ HTTP POST
 */
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

    // 1. เข้าสู่ระบบ (Login via POST)
    if (action === 'login') {
      const authResult = authenticateUser(payload.username, payload.password);
      return jsonResponse(authResult);
    }

    // 2. อัปเดตข้อมูลการประเมิน: กลุ่ม CL (ปกติ, เสี่ยง, ป่วย) และ คำแนะนำ CJ
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

    // 3. ลบข้อมูลเจ้าหน้าที่ (Delete Row)
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

    // 4. บันทึกข้อมูลจากการส่งออกของ Healthcheckup.php (รักษาความเข้ากันได้ 100%)
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

/**
 * ฟังก์ชันอ่านข้อมูลจาก Google Sheet ทั้งหมด แปลงเป็นรูปแบบ JSON พร้อมสถิติ
 */
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

  // ตรวจสอบและตั้งชื่อหัวคอลัมน์ CJ และ CL ในแถวที่ 1 หากยังไม่มี
  ensureAssessmentHeaders(sheet);

  // อ่านข้อมูลทั้งหมดแบบ Batch
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
    
    // ตรวจสอบว่าเป็นแถวที่มีข้อมูลจริง (มี HN หรือ VN หรือ ชื่อ)
    const hn = String(row[COL_INDEX.HN - 1] || '').trim();
    const vn = String(row[COL_INDEX.VN - 1] || '').trim();
    const name = String(row[COL_INDEX.NAME - 1] || '').trim();

    if (!hn && !vn && !name) continue;

    const groupVal = String(row[COL_INDEX.GROUP - 1] || '').trim();
    const adviceVal = String(row[COL_INDEX.ADVICE - 1] || '').trim();

    // สถิติกลุ่ม
    if (groupVal === 'ปกติ') countNormal++;
    else if (groupVal === 'เสี่ยง') countRisk++;
    else if (groupVal === 'ป่วย') countSick++;
    else countUnassessed++;

    if (adviceVal) countHasAdvice++;

    // จัดเก็บแถวข้อมูล
    rows.push({
      rowIndex: r + 1, // ตำแหน่งแถวจริงในชีต (1-indexed)
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
      rawRow: row // ข้อมูลผล Lab ทุกคอลัมน์
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

/**
 * อัปเดตข้อมูลการประเมิน: กลุ่ม CL (ปกติ, เสี่ยง, ป่วย) และ คำแนะนำ CJ
 */
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

  // หากไม่ได้ระบุ rowIndex หรือต้องการตรวจสอบความถูกต้อง ให้ค้นหาแถวจาก VN หรือ HN
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

  const newGroup = String(payload.group || '').trim(); // ปกติ, เสี่ยง, ป่วย
  const newAdvice = String(payload.advice || '').trim();

  // บันทึกลงในคอลัมน์ CJ (88) และ CL (90)
  sheet.getRange(targetRowIndex, COL_INDEX.ADVICE).setValue(newAdvice);
  sheet.getRange(targetRowIndex, COL_INDEX.GROUP).setValue(newGroup);

  // ตั้งค่าไฮไลท์สีในคอลัมน์กลุ่ม CL ให้อ่านง่าย
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

/**
 * ลบข้อมูลเจ้าหน้าที่ (Delete Row)
 */
function deletePatientRecord(sheetId, sheetName, payload) {
  const ss = SpreadsheetApp.openById(sheetId);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return { success: false, message: `ไม่พบแท็บชีต ${sheetName}` };
  }

  let targetRowIndex = parseInt(payload.rowIndex, 10);
  const targetHn = String(payload.hn || '').trim();
  const targetVn = String(payload.vn || '').trim();

  // ค้นหาแถวเพื่อความถูกต้อง
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

  // ลบแถวออกจาก Google Sheet
  sheet.deleteRow(targetRowIndex);

  return {
    success: true,
    message: `ลบข้อมูลแถวที่ ${targetRowIndex} เรียบร้อยแล้ว`,
    deleted_row: targetRowIndex,
    deleted_hn: targetHn,
    deleted_vn: targetVn
  };
}

/**
 * บันทึกข้อมูลแบบ Batch จากการส่งออกของ Healthcheckup.php
 */
function appendHealthData(sheetId, sheetName, rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { status: 'empty', message: 'ไม่มีแถวข้อมูลที่ต้องบันทึก' };
  }

  const ss = SpreadsheetApp.openById(sheetId);
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  // หากชีตยังไม่มีหัวตาราง ให้นำแถวแรกมาสร้าง Header
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

/**
 * ตรวจสอบและตั้งชื่อหัวตารางคอลัมน์ CJ (คำแนะนำ) และ CL (กลุ่ม)
 */
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

/**
 * ฟอร์แมตค่าในเซลล์ให้เป็น String ที่พร้อมแสดงผล
 */
function formatCellValue(val) {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'GMT+7', 'yyyy-MM-dd');
  }
  return String(val);
}

/**
 * สร้าง JSON Response
 */
function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * =========================================================================
 * Auth.gs - ระบบจัดการการยืนยันตัวตนและการรักษาความปลอดภัย
 * โรงพยาบาลไทรโยค - ระบบตรวจสุขภาพประจำปีเจ้าหน้าที่
 * =========================================================================
 * บัญชีผู้ใช้งานระบบ:
 * User: admin11278
 * Pass: admin11278
 * =========================================================================
 */

// บัญชีผู้ดูแลระบบที่ได้รับอนุญาต
const AUTH_CONFIG = {
  USERNAME: 'admin11278',
  PASSWORD: 'admin11278',
  TOKEN_SECRET: 'Saiyok_Healthcheckup_SecretKey_2026',
  TOKEN_EXPIRY_HOURS: 72 // อายุ Token 3 วัน
};

/**
 * ฟังก์ชันตรวจสอบการล็อกอิน
 * @param {string} username ชื่อผู้ใช้
 * @param {string} password รหัสผ่าน
 * @returns {object} ผลการตรวจสอบและ Token
 */
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

/**
 * สร้าง Auth Token แบบ HMAC-SHA256 Base64 พร้อมวันหมดอายุ
 * @param {string} username
 * @returns {string}
 */
function generateAuthToken(username) {
  const expiresAt = new Date().getTime() + (AUTH_CONFIG.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  const rawData = `${username}:${expiresAt}`;
  const signatureBytes = Utilities.computeHmacSha256Signature(rawData, AUTH_CONFIG.TOKEN_SECRET);
  const signature = Utilities.base64Encode(signatureBytes);
  const tokenPayload = `${rawData}:${signature}`;
  return Utilities.base64Encode(tokenPayload);
}

/**
 * ตรวจสอบความถูกต้องของ Token
 * @param {string} token
 * @returns {boolean}
 */
function validateAuthToken(token) {
  if (!token) return false;
  try {
    const decoded = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString();
    const parts = decoded.split(':');
    if (parts.length !== 3) return false;

    const username = parts[0];
    const expiresAt = parseInt(parts[1], 10);
    const signature = parts[2];

    // ตรวจสอบวันหมดอายุ
    if (new Date().getTime() > expiresAt) return false;

    // ตรวจสอบความถูกต้องของ Signature
    const rawData = `${username}:${expiresAt}`;
    const expectedSigBytes = Utilities.computeHmacSha256Signature(rawData, AUTH_CONFIG.TOKEN_SECRET);
    const expectedSignature = Utilities.base64Encode(expectedSigBytes);

    return signature === expectedSignature && username === AUTH_CONFIG.USERNAME;
  } catch (err) {
    return false;
  }
}

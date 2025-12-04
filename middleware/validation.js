// middleware/validation.js
const validator = require('validator');

// 常用的恶意字符串模式
const MALICIOUS_PATTERNS = [
  /union\s+select/i,
  /select\s+.*\s+from/i,
  /insert\s+into/i,
  /update\s+.*\s+set/i,
  /delete\s+from/i,
  /drop\s+table/i,
  /create\s+table/i,
  /alter\s+table/i,
  /exec\s*\(/i,
  /script\s*>/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /<iframe/i,
  /<object/i,
  /<embed/i,
  /document\.cookie/i,
  /document\.location/i,
  /window\.location/i,
  /\.\.\//,
  /--/,
  /\/\*/,
  /\*\//,
  /;/,
  /'/,
  /"/,
  /`/,
  /\\/,
];

/**
 * 检测字符串是否包含恶意内容
 * @param {string} str - 要检查的字符串
 * @returns {boolean} - 是否包含恶意内容
 */
function containsMaliciousContent(str) {
  if (typeof str !== 'string') return false;
  
  // 检查是否包含恶意SQL注入模式
  for (const pattern of MALICIOUS_PATTERNS) {
    if (pattern.test(str)) {
      return true;
    }
  }
  
  // 检查是否包含控制字符
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(str)) {
    return true;
  }
  
  return false;
}

/**
 * 清理和验证字符串
 * @param {string} str - 要清理的字符串
 * @param {Object} options - 清理选项
 * @returns {string} - 清理后的字符串
 */
function sanitizeString(str, options = {}) {
  if (typeof str !== 'string') return str;
  
  const {
    maxLength = 1000,
    allowEmpty = true,
    trim = true,
  } = options;
  
  // 去除首尾空格
  if (trim) {
    str = str.trim();
  }
  
  // 检查是否为空
  if (!allowEmpty && str === '') {
    throw new Error('字段不能为空');
  }
  
  // 检查长度
  if (str.length > maxLength) {
    throw new Error(`字段长度不能超过 ${maxLength} 个字符`);
  }
  
  // 检查恶意内容
  if (containsMaliciousContent(str)) {
    throw new Error('包含非法字符或恶意内容');
  }
  
  return str;
}

/**
 * 验证数字
 * @param {*} num - 要验证的数字
 * @param {Object} options - 验证选项
 * @returns {number} - 验证后的数字
 */
function validateNumber(num, options = {}) {
  const {
    min = Number.MIN_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER,
    integer = false,
    required = true,
  } = options;
  
  if (num === undefined || num === null) {
    if (required) {
      throw new Error('数字字段是必需的');
    }
    return num;
  }
  
  // 转换为数字
  const parsed = Number(num);
  if (isNaN(parsed)) {
    throw new Error('无效的数字格式');
  }
  
  // 检查是否为整数
  if (integer && !Number.isInteger(parsed)) {
    throw new Error('必须是整数');
  }
  
  // 检查范围
  if (parsed < min || parsed > max) {
    throw new Error(`数字必须在 ${min} 到 ${max} 之间`);
  }
  
  return parsed;
}

/**
 * 验证邮箱
 * @param {string} email - 要验证的邮箱
 * @returns {string} - 验证后的邮箱
 */
function validateEmail(email) {
  if (!email) return email;
  
  if (typeof email !== 'string') {
    throw new Error('邮箱必须是字符串');
  }
  
  if (!validator.isEmail(email)) {
    throw new Error('邮箱格式不正确');
  }
  
  return sanitizeString(email, { maxLength: 255 });
}

/**
 * 验证手机号
 * @param {string} phone - 要验证的手机号
 * @returns {string} - 验证后的手机号
 */
function validatePhone(phone) {
  if (!phone) return phone;
  
  if (typeof phone !== 'string') {
    throw new Error('手机号必须是字符串');
  }
  
  // 中国手机号验证
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    throw new Error('手机号格式不正确');
  }
  
  return phone;
}

/**
 * 验证GUID格式
 * @param {string} guid - 要验证的GUID
 * @returns {string} - 验证后的GUID
 */
function validateGUID(guid) {
  if (!guid) return guid;
  
  if (typeof guid !== 'string') {
    throw new Error('GUID必须是字符串');
  }
  
  // 验证常见GUID格式
  const guidPattern = /^[a-zA-Z0-9_-]{8,64}$/;
  if (!guidPattern.test(guid)) {
    throw new Error('GUID格式不正确');
  }
  
  return sanitizeString(guid, { maxLength: 64 });
}

/**
 * 验证微信openid/unionid
 * @param {string} openid - 要验证的openid
 * @returns {string} - 验证后的openid
 */
function validateWechatId(openid) {
  if (!openid) return openid;
  
  if (typeof openid !== 'string') {
    throw new Error('微信ID必须是字符串');
  }
  
  // 微信openid/unionid格式验证
  if (!/^[a-zA-Z0-9_-]{10,100}$/.test(openid)) {
    throw new Error('微信ID格式不正确');
  }
  
  return sanitizeString(openid, { maxLength: 100 });
}

/**
 * 验证版本号
 * @param {string} version - 要验证的版本号
 * @returns {string} - 验证后的版本号
 */
function validateVersion(version) {
  if (!version) return version;
  
  if (typeof version !== 'string') {
    throw new Error('版本号必须是字符串');
  }
  
  // 版本号格式验证 (如: v1.0.6, 1.0.6)
  if (!/^(v)?\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
    throw new Error('版本号格式不正确');
  }
  
  return sanitizeString(version, { maxLength: 20 });
}

/**
 * 验证平台类型
 * @param {string} platform - 要验证的平台类型
 * @returns {string} - 验证后的平台类型
 */
function validatePlatform(platform) {
  if (!platform) return platform;
  
  const validPlatforms = ['ios', 'android', 'web', 'miniprogram', 'unknown'];
  
  if (!validPlatforms.includes(platform.toLowerCase())) {
    throw new Error('平台类型不正确');
  }
  
  return platform.toLowerCase();
}

/**
 * 参数验证中间件生成器
 * @param {Object} schema - 验证规则配置
 * @returns {Function} - Express中间件函数
 */
function validateRequest(schema) {
  return (req, res, next) => {
    try {
      const validatedData = {};
      
      // 验证请求体
      if (schema.body) {
        validatedData.body = validateObject(req.body, schema.body);
      }
      
      // 验证查询参数
      if (schema.query) {
        validatedData.query = validateObject(req.query, schema.query);
      }
      
      // 验证路径参数
      if (schema.params) {
        validatedData.params = validateObject(req.params, schema.params);
      }
      
      // 将验证后的数据附加到请求对象
      req.validated = validatedData;
      
      next();
    } catch (error) {
      console.error('参数验证失败:', error.message);
      return res.status(400).json({
        code: 400,
        message: '参数验证失败',
        error: error.message,
      });
    }
  };
}

/**
 * 验证对象
 * @param {Object} obj - 要验证的对象
 * @param {Object} schema - 验证规则
 * @returns {Object} - 验证后的对象
 */
function validateObject(obj, schema) {
  const result = {};
  
  for (const [key, rules] of Object.entries(schema)) {
    const value = obj && obj[key];
    const { type, required = false, validate, sanitize = true } = rules;
    
    // 检查必需字段
    if (required && (value === undefined || value === null)) {
      throw new Error(`缺少必需字段: ${key}`);
    }
    
    // 如果字段不存在且不是必需的，跳过验证
    if (value === undefined || value === null) {
      continue;
    }
    
    // 类型验证
    if (type && typeof value !== type) {
      throw new Error(`字段 ${key} 类型错误，期望 ${type}，实际 ${typeof value}`);
    }
    
    // 自定义验证
    if (validate && typeof validate === 'function') {
      result[key] = validate(value);
    } else if (type === 'string' && sanitize) {
      result[key] = sanitizeString(value);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}

module.exports = {
  containsMaliciousContent,
  sanitizeString,
  validateNumber,
  validateEmail,
  validatePhone,
  validateGUID,
  validateWechatId,
  validateVersion,
  validatePlatform,
  validateRequest,
  validateObject,
  MALICIOUS_PATTERNS,
};
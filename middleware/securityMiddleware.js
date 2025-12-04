// middleware/securityMiddleware.js
const { containsMaliciousContent, sanitizeString } = require('./validation');

/**
 * 全局安全中间件 - 对所有请求进行基础安全检查
 */
function securityMiddleware(req, res, next) {
  try {
    // 检查请求体中的恶意内容
    if (req.body && typeof req.body === 'object') {
      checkObjectForMaliciousContent(req.body);
    }
    
    // 检查查询参数中的恶意内容
    if (req.query && typeof req.query === 'object') {
      checkObjectForMaliciousContent(req.query);
    }
    
    // 检查路径参数中的恶意内容
    if (req.params && typeof req.params === 'object') {
      checkObjectForMaliciousContent(req.params);
    }
    
    // 设置安全响应头
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    next();
  } catch (error) {
    console.error('安全检查失败:', error.message);
    return res.status(400).json({
      code: 400,
      message: '请求包含不安全内容',
      error: error.message,
    });
  }
}

/**
 * 递归检查对象中的恶意内容
 * @param {Object} obj - 要检查的对象
 */
function checkObjectForMaliciousContent(obj) {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      if (containsMaliciousContent(value)) {
        throw new Error(`参数 "${key}" 包含不安全内容`);
      }
      // 清理字符串值
      obj[key] = sanitizeString(value, { maxLength: 10000 });
    } else if (typeof value === 'object' && value !== null) {
      // 递归检查嵌套对象
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'object' && item !== null) {
            checkObjectForMaliciousContent(item);
          } else if (typeof item === 'string') {
            if (containsMaliciousContent(item)) {
              throw new Error(`数组索引 ${index} 包含不安全内容`);
            }
          }
        });
      } else {
        checkObjectForMaliciousContent(value);
      }
    }
  }
}

/**
 * 请求频率限制中间件
 * @param {Object} options - 配置选项
 * @returns {Function} - Express中间件函数
 */
function rateLimit(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15分钟
    max = 100, // 最大请求数
    message = '请求过于频繁，请稍后再试',
    skipSuccessfulRequests = false,
  } = options;
  
  const requests = new Map();
  
  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    
    // 获取当前IP的请求记录
    let requestData = requests.get(key);
    
    if (!requestData) {
      requestData = {
        count: 0,
        resetTime: now + windowMs,
      };
      requests.set(key, requestData);
    }
    
    // 检查是否需要重置
    if (now > requestData.resetTime) {
      requestData.count = 0;
      requestData.resetTime = now + windowMs;
    }
    
    // 增加请求计数
    requestData.count++;
    
    // 检查是否超过限制
    if (requestData.count > max) {
      console.warn(`IP ${key} 请求频率超限: ${requestData.count}/${max}`);
      return res.status(429).json({
        code: 429,
        message,
        retryAfter: Math.ceil((requestData.resetTime - now) / 1000),
      });
    }
    
    // 定期清理过期记录
    if (Math.random() < 0.01) { // 1%的概率执行清理
      cleanupExpiredRecords(requests, now);
    }
    
    next();
  };
}

/**
 * 清理过期的请求记录
 * @param {Map} requests - 请求记录映射
 * @param {number} now - 当前时间戳
 */
function cleanupExpiredRecords(requests, now) {
  for (const [key, data] of requests.entries()) {
    if (now > data.resetTime) {
      requests.delete(key);
    }
  }
}

/**
 * 请求大小限制中间件
 * @param {Object} options - 配置选项
 * @returns {Function} - Express中间件函数
 */
function requestSizeLimit(options = {}) {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB
    message = '请求体过大',
  } = options;
  
  return (req, res, next) => {
    const contentLength = req.headers['content-length'];
    
    if (contentLength && parseInt(contentLength) > maxSize) {
      return res.status(413).json({
        code: 413,
        message,
        maxSize: `${maxSize / (1024 * 1024)}MB`,
      });
    }
    
    next();
  };
}

module.exports = {
  securityMiddleware,
  rateLimit,
  requestSizeLimit,
};
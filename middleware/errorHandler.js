// middleware/errorHandler.js

/**
 * 统一错误处理中间件
 * 捕获所有未处理的错误，返回标准化的错误响应
 */

class AppError extends Error {
  constructor(message, statusCode = 500, code = -1) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// 业务错误类型
class ValidationError extends AppError {
  constructor(message = '参数验证失败') {
    super(message, 400, 400);
  }
}

class AuthenticationError extends AppError {
  constructor(message = '认证失败') {
    super(message, 401, 401);
  }
}

class AuthorizationError extends AppError {
  constructor(message = '权限不足') {
    super(message, 403, 403);
  }
}

class NotFoundError extends AppError {
  constructor(message = '资源未找到') {
    super(message, 404, 404);
  }
}

class DatabaseError extends AppError {
  constructor(message = '数据库操作失败') {
    super(message, 500, 500);
  }
}

class WeChatApiError extends AppError {
  constructor(message = '微信API调用失败') {
    super(message, 500, 500);
  }
}

/**
 * 统一错误处理中间件
 */
const errorHandler = (err, req, res, next) => {
  // 设置默认值
  let statusCode = err.statusCode || 500;
  let code = err.code || -1;
  let message = err.message || '服务器内部错误';
  
  // 开发环境显示详细错误信息
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // 记录错误日志
  console.error('❌ 错误信息:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  
  // 处理JWT错误
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 401;
    message = 'Token格式错误';
  }
  
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 401;
    message = 'Token已过期';
  }
  
  // 处理数据库错误
  if (err.code === 'ER_DUP_ENTRY') {
    statusCode = 400;
    code = 400;
    message = '数据已存在';
  }
  
  if (err.code === 'ER_NO_REFERENCED_ROW') {
    statusCode = 400;
    code = 400;
    message = '关联数据不存在';
  }
  
  // 处理Axios错误
  if (err.isAxiosError) {
    statusCode = err.response?.status || 500;
    code = statusCode;
    message = `第三方API调用失败: ${err.response?.data?.errmsg || err.message}`;
  }
  
  // 构建响应
  const errorResponse = {
    success: false,
    code,
    message,
    ...(isDevelopment && { 
      stack: err.stack,
      details: err.details 
    })
  };
  
  res.status(statusCode).json(errorResponse);
};

/**
 * 404处理中间件
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(`路由 ${req.method} ${req.url} 不存在`);
  next(error);
};

/**
 * 异步错误包装器
 * 避免在每个async函数中手动写try-catch
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  DatabaseError,
  WeChatApiError,
  errorHandler,
  notFoundHandler,
  asyncHandler
};
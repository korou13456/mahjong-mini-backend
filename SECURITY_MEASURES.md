# 安全防护措施

本项目已实施了多层安全防护措施来防止SQL注入、XSS攻击和恶意数据。

## 🛡️ 已实施的安全措施

### 1. 参数验证中间件 (`middleware/validation.js`)

#### 主要功能：
- **恶意内容检测**：自动检测SQL注入、XSS攻击等恶意模式
- **数据清理**：自动清理和验证输入数据
- **类型验证**：确保数据类型正确
- **长度限制**：防止过长输入导致的溢出攻击

#### 检测的恶意模式：
```javascript
const MALICIOUS_PATTERNS = [
  /union\s+select/i,           // SQL注入
  /select\s+.*\s+from/i,      // SQL注入
  /insert\s+into/i,           // SQL注入
  /update\s+.*\s+set/i,       // SQL注入
  /delete\s+from/i,            // SQL注入
  /exec\s*\(/i,               // 代码执行
  /script\s*>/i,              // XSS攻击
  /javascript:/i,             // XSS攻击
  /on\w+\s*=/i,              // XSS攻击
  /<iframe/i,                 // XSS攻击
  // ... 更多模式
];
```

### 2. 全局安全中间件 (`middleware/securityMiddleware.js`)

#### 功能特性：
- **递归检查**：深度检查嵌套对象和数组
- **安全响应头**：设置XSS保护、内容类型保护等响应头
- **请求频率限制**：防止暴力攻击
- **请求大小限制**：防止大文件攻击

#### 安全响应头：
```http
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

### 3. 专用验证规则 (`middleware/basicValidation.js`)

为特定接口提供定制化验证：
- **登录接口**：验证code、GUID等关键参数
- **安装日志接口**：验证版本号、设备信息等
- **房间管理接口**：验证房间ID、时间格式等
- **用户信息接口**：验证昵称、头像等用户数据

## 🚨 防护的攻击类型

### 1. SQL注入攻击
```sql
-- 阻止此类攻击
" union select 1,2-- "
" or 1=1-- "
"'; DROP TABLE users;-- "
```

### 2. XSS攻击
```html
<!-- 阻止此类攻击 -->
<script>alert('XSS')</script>
<img src=x onerror=alert('XSS')>
```

### 3. 恶意数据注入
```json
// 阻止包含恶意控制字符的数据
{
  "device_model": "364,\"\"\" union select 1,2-- \"",
  "install_version": "v1.0.6<script>"
}
```

## 📊 应用到的接口

| 接口路径 | 验证类型 | 频率限制 |
|---------|---------|----------|
| `/api/mahjong/login` | 参数验证 + 恶意内容检测 | 15分钟内最多10次 |
| `/api/mahjong/record-install` | 参数验证 + 恶意内容检测 | 1分钟内最多5次 |
| `/api/mahjong/create-room` | 参数验证 + 恶意内容检测 | 默认限制 |
| `/api/mahjong/enter-room` | 参数验证 + 恶意内容检测 | 默认限制 |
| `/api/mahjong/exit-room` | 参数验证 + 恶意内容检测 | 默认限制 |
| `/api/mahjong/update-user-info` | 参数验证 + 恶意内容检测 | 默认限制 |
| `/api/mahjong/invite-points` | 参数验证 + 恶意内容检测 | 默认限制 |
| `/api/mahjong/share-points` | 参数验证 + 恶意内容检测 | 默认限制 |

## 🔧 使用方法

### 1. 为新接口添加验证
```javascript
const { validateRequest } = require('../../middleware/validation');

// 定义验证规则
const myValidation = validateRequest({
  body: {
    name: {
      type: 'string',
      required: true,
      validate: (value) => sanitizeString(value, { maxLength: 100 })
    },
    age: {
      type: 'number',
      required: true,
      validate: (value) => validateNumber(value, { min: 0, max: 150 })
    }
  }
});

// 应用到路由
router.post('/my-endpoint', myValidation, myHandler);
```

### 2. 自定义验证函数
```javascript
const validateCustom = (value) => {
  if (!/^MY_\d+$/.test(value)) {
    throw new Error('格式不正确');
  }
  return value;
};
```

## 📈 监控和日志

### 安全事件日志
所有安全相关的错误都会记录到控制台：
```javascript
console.error('安全检查失败:', error.message);
console.warn(`IP ${ip} 请求频率超限: ${count}/${max}`);
```

### 建议的监控指标
1. **安全检查失败次数**：监控恶意攻击尝试
2. **频率限制触发次数**：监控暴力攻击
3. **异常IP地址**：识别可疑来源

## 🔄 持续改进

### 定期更新
1. **恶意模式库**：根据新的攻击模式更新检测规则
2. **验证规则**：根据业务需求调整验证逻辑
3. **监控指标**：添加新的安全监控指标

### 建议的额外安全措施
1. **IP白名单**：对敏感接口实施IP白名单
2. **内容验证**：对上传文件进行病毒扫描
3. **数据库审计**：记录所有数据库操作
4. **日志分析**：使用SIEM系统分析安全日志

## 🚨 紧急响应

### 发现安全事件时的处理流程
1. **立即阻止**：通过频率限制阻止可疑IP
2. **日志分析**：分析攻击模式和影响范围
3. **更新规则**：更新验证规则阻止类似攻击
4. **安全审计**：进行全面的安全审计

## 📞 联系方式

如有安全相关问题或发现新的攻击模式，请及时联系开发团队。
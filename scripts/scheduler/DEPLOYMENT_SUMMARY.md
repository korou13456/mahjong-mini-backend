# 机器人桌局管理系统部署总结

## 📋 系统概述

机器人桌局管理系统是一个智能化的麻将小程序后台服务，通过动态创建和管理机器人桌局来提升平台活跃度，解决用户冷启动问题，确保用户随时都能找到活跃的桌局。

## ✅ 已完成的核心功能

### 1. 数据库架构
- ✅ `virtual_user` 表 - 机器人用户数据池
- ✅ `table_list.is_robot_table` 字段 - 标记机器人桌局
- ✅ `table_list.is_robot_table` 字段 - 标记机器人桌局
- ✅ 完整的数据库迁移脚本

### 2. 核心系统组件
- ✅ `scripts/scheduler.js` - 机器人桌局管理主引擎
- ✅ `scripts/add_robot_fields.sql` - 数据库结构升级
- ✅ `routes/mahjong/getTableList.js` - 桌局列表接口（集成虚拟用户状态管理）
- ✅ `routes/mahjong/enterRoom.js` - 加入房间接口（集成机器人清理逻辑）
- ✅ 智能机器人用户管理系统
- ✅ 动态门店获取机制
- ✅ 完整的日志记录系统

### 3. 智能业务逻辑
- ✅ **动态机器人获取** - 从 `virtual_user` 表实时获取可用机器人
- ✅ **智能桌局创建** - 基于实时条件动态创建
- ✅ **精准退出策略** - 根据房间人数和时间智能退出
- ✅ **房主切换机制** - 机器人退出时自动处理房主变更
- ✅ **时间管理优化** - 开始时间设置为1小时后的下一个半点
- ✅ **完整状态管理** - 房间过期时自动重置机器人状态为闲置

## 🎯 系统核心特性

### 桌局创建规则
- **工作时间**: 01:00 - 23:00（全天候服务）
- **触发条件**: 桌局总数 < 3 桌
- **创建间隔**: 至少5分钟
- **机器人数量**: 随机1-2个
- **门店选择**: 从营业门店随机选择
- **开始时间**: 1小时后的下一个半点（如15:15 → 16:30）

### 机器人退出策略
- **房间满员前退出**: 当房间总人数达到 `req_num-1` 时机器人退出
- **真人数量触发**: 根据真人用户数量和房间需求动态判断
- **时间条件**: 考虑用户加入时间和等待时长
- **概率控制**: 40%退出概率，避免过于频繁
- **延迟执行**: 3秒延迟，模拟自然行为

### 数据源管理
- **机器人用户**: `virtual_user` 表（所有记录都是机器人，`user_id < 0`）
  - `status = 0`: 闲置状态，可被分配到新房间
  - `status = 1`: 房间中状态，正在参与桌局
- **门店信息**: `stores` 表（`status = 1` 的营业门店）
- **桌局数据**: `table_list` 表（支持 `is_robot_table` 标记）

## 🚀 部署配置

### 环境要求
- Node.js 14+
- MySQL 5.7+
- PM2（推荐用于生产环境）

### 启动命令
```bash
# 开发环境启动
yarn scheduler

# 生产环境部署
pm2 start scripts/scheduler.js --name robot-scheduler

# 查看运行状态
pm2 status
pm2 logs robot-scheduler

# 停止服务
pm2 stop robot-scheduler
```

### 监控命令
```bash
# 查看系统日志
tail -f scripts/scheduler.log

# 查看桌局创建日志
tail -f scripts/table_creation.log

# 手动执行一次任务
node -e "require('./scripts/scheduler.js').executeTask()"
```

## 📊 数据库管理

### 核心查询语句
```sql
-- 查看当前机器人桌局
SELECT * FROM table_list WHERE is_robot_table = 1 AND status = 0;

-- 查看可用机器人用户
SELECT user_id, nickname, avatar_url, gender 
FROM virtual_user 
WHERE status = 0 
ORDER BY RAND() 
LIMIT 10;

-- 查看营业门店
SELECT id, name FROM stores WHERE status = 1;

-- 桌局统计信息
SELECT 
  COUNT(*) as total_tables,
  SUM(CASE WHEN is_robot_table = 1 THEN 1 ELSE 0 END) as robot_tables,
  SUM(CASE WHEN is_robot_table = 0 THEN 1 ELSE 0 END) as real_tables
FROM table_list 
WHERE status = 0 
  AND TIMESTAMPDIFF(HOUR, create_time, NOW()) <= 2
  AND start_time >= NOW();
```

### 机器人用户管理
```sql
-- 查看机器人状态分布
SELECT status, COUNT(*) as count 
FROM virtual_user 
GROUP BY status;
-- status: 0=闲置, 1=房间中

-- 重置机器人状态
UPDATE virtual_user SET status = 0 WHERE status = 1;

-- 添加新机器人
INSERT INTO virtual_user (user_id, nickname, avatar_url, gender, status, created_at, updated_at) 
VALUES (-5001, '新机器人', 'https://example.com/avatar.jpg', 2, 0, NOW(), NOW());

-- 查看房间过期时自动重置的机器人状态（getTableList.js集成功能）
SELECT user_id, nickname, status, updated_at 
FROM virtual_user 
WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
ORDER BY updated_at DESC;
```

## ⚙️ 系统配置

### 核心配置参数
```javascript
const ROBOT_CONFIG = {
  // 桌局创建控制
  maxTableCount: 3,         // 桌局总数 < 3 桌时自动补
  createInterval: 5,        // 每次创建至少间隔5分钟
  
  // 工作时间控制
  workStartHour: 1,          // 工作开始时间 01:00
  workEndHour: 23,           // 工作结束时间 23:00
  
  // 机器人退出控制
  exitDelayMin: 10,         // 最近用户加入后至少等待10分钟
  exitProbability: 0.4,      // 退出概率 40%
  exitDelaySeconds: {       // 退出延迟时间（秒）
    min: 10,
    max: 45
  }
};
```

## 🔧 运维管理

### 日志文件管理
- `scripts/scheduler.log` - 系统运行日志
- `scripts/table_creation.log` - 桌局创建详细日志

### 性能监控
```bash
# 监控PM2进程
pm2 monit

# 查看内存使用情况
pm2 show robot-scheduler

# 重启服务
pm2 restart robot-scheduler
```

### 定时任务管理
系统使用 `node-cron` 每分钟执行一次任务：
```javascript
// 每分钟的第0秒执行
cron.schedule("0 * * * * *", executeTask);
```

## 🆘 故障排除

### 常见问题及解决方案

#### 1. 桌局不创建
**可能原因**:
- 不在工作时间内
- 桌局数量已达上限
- 没有可用机器人
- 没有营业门店

**排查步骤**:
```sql
-- 检查当前时间是否在工作时间内
SELECT NOW(), HOUR(NOW());

-- 检查桌局数量
SELECT COUNT(*) FROM table_list WHERE status = 0;

-- 检查可用机器人
SELECT COUNT(*) FROM virtual_user WHERE status = 0;

-- 检查营业门店
SELECT COUNT(*) FROM stores WHERE status = 1;
```

#### 2. 机器人不退出
**可能原因**:
- 退出条件不满足
- 时间条件未达到
- 概率未触发

**调试方法**:
```bash
# 查看详细退出逻辑日志
grep "机器人退出" scripts/scheduler.log | tail -20
```

#### 3. 数据库连接问题
**检查配置**:
```bash
# 测试数据库连接
mysql -h127.0.0.1 -uroot -p791204 myapp -e "SELECT 1"

# 检查环境变量
cat .env | grep DB_
```

### 紧急处理方案
```bash
# 立即停止机器人管理
pm2 stop robot-scheduler

# 清理机器人桌局（谨慎操作）
UPDATE table_list SET status = 1 WHERE is_robot_table = 1 AND status = 0;

# 重置机器人状态
UPDATE virtual_user SET status = 0 WHERE status = 1;
```

## 📈 系统优化建议

### 1. 性能优化
- 定期清理日志文件
- 监控数据库连接池
- 优化查询索引

### 2. 业务优化
- 定期更新机器人头像和昵称池
- 根据用户行为调整退出策略
- 监控桌局成局率

### 3. 监控告警
- 设置桌局数量异常告警
- 监控机器人可用数量
- 跟踪系统执行成功率

---

## 📞 技术支持

系统已完全部署完成，如遇到问题请：
1. 查看相关日志文件
2. 执行故障排除步骤
3. 联系开发团队获取支持

**部署完成时间**: 2024年
**系统版本**: v2.1
**最后更新**: 包含机器人退出优化、时间管理优化、完整虚拟用户状态管理等最新功能
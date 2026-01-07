# 机器人桌局管理系统

## 🎯 系统目标

机器人桌局管理系统是麻将小程序的核心智能服务，旨在：

- **提升平台活跃度** - 确保用户随时能看到活跃桌局
- **降低参与门槛** - 机器人破冰，避免用户成为"第一个人"
- **优化用户体验** - 智能退出机制，不影响真实用户拼局
- **支持平台冷启动** - 营造活跃氛围，吸引新用户

## 🏗️ 系统架构

```
机器人桌局管理系统
├── 核心引擎 (scheduler.js)
│   ├── 定时任务调度器
│   ├── 桌局创建逻辑
│   ├── 机器人退出策略
│   └── 日志记录系统
├── 数据层
│   ├── virtual_user (机器人用户池)
│   ├── table_list (桌局数据)
│   └── stores (门店信息)
└── 集成接口
    ├── enterRoom.js (加入房间逻辑 + 机器人清理)
    └── getTableList.js (桌局列表接口 + 虚拟用户状态管理)
```

## 📁 文件结构

```
scripts/
├── scheduler.js                    # 🤖 机器人桌局管理主引擎
├── add_robot_fields.sql            # 📊 数据库迁移脚本
├── README.md                       # 📖 系统说明文档
├── DEPLOYMENT_SUMMARY.md           # 🚀 部署总结文档
├── scheduler.log                   # 📝 系统运行日志
└── table_creation.log              # 📋 桌局创建日志
```

## 🚀 快速开始

### 1. 环境准备
```bash
# 确保Node.js和MySQL已安装
node --version  # >= 14.0.0
mysql --version

# 安装依赖
yarn install
```

### 2. 数据库初始化
```bash
# 执行数据库迁移（添加机器人相关字段）
yarn robot:migrate

# 验证表结构
mysql -h127.0.0.1 -uroot -p791204 myapp -e "DESCRIBE virtual_user"
```

### 3. 启动系统
```bash
# 开发环境启动
yarn scheduler

# 生产环境部署（推荐）
pm2 start scripts/scheduler.js --name robot-scheduler

# 查看运行状态
pm2 status && pm2 logs robot-scheduler
```

## ⚙️ 核心配置

### 系统参数配置
编辑 `scripts/scheduler.js` 中的 `ROBOT_CONFIG`：

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

### 定时任务配置
```javascript
// 每分钟执行一次任务
cron.schedule("0 * * * * *", executeTask);

// 每5分钟执行一次（可选）
cron.schedule("*/5 * * * *", executeTask);
```

## 🎮 业务逻辑详解

### 桌局创建流程

#### 触发条件检查
1. **时间检查**: 当前时间是否在 01:00-23:00 范围内
2. **数量检查**: 当前活跃桌局总数 < 3 桌
3. **间隔检查**: 距离上次创建 ≥ 5 分钟
4. **资源检查**: 有可用机器人和营业门店

#### 创建执行步骤
1. **获取机器人**: 从 `virtual_user` 表随机获取1-2个闲置机器人
2. **选择门店**: 从营业门店中随机选择一个
3. **设置时间**: 开始时间 = 1小时后的下一个半点
4. **创建桌局**: 插入 `table_list` 表，标记为机器人桌局
5. **状态更新**: 更新机器人状态为"房间中"
6. **记录日志**: 详细记录创建信息

#### 时间计算逻辑
```javascript
// 示例：当前时间 15:15
// 1小时后：16:15 → 下一个半点：16:30

// 示例：当前时间 15:45  
// 1小时后：16:45 → 下一个半点：17:00

const startTime = new Date();
startTime.setHours(startTime.getHours() + 1);

if (startTime.getMinutes() > 30) {
  startTime.setHours(startTime.getHours() + 1);
  startTime.setMinutes(0);
} else if (startTime.getMinutes() > 0) {
  startTime.setMinutes(30);
} else {
  startTime.setMinutes(30);
}
```

### 机器人退出策略

#### 退出触发条件
机器人会在以下情况退出房间：

1. **房间满员前退出**:
   - 当房间总人数达到 `req_num - 1` 时
   - 为真实用户腾出空间

2. **真人数量触发**:
   - 真人数量达到房间需求时机器人退出
   - 确保真实用户能够正常游戏

3. **时间条件**:
   - 距离上次用户加入 ≥ 10分钟
   - 避免机器人过快退出

4. **概率控制**:
   - 40% 概率执行退出
   - 增加行为的不确定性

#### 退出执行流程
1. **条件判断**: 检查是否满足退出条件
2. **延迟执行**: 3秒延迟，模拟自然行为
3. **房主处理**: 调用 `leaveRoom` 处理房主切换
4. **状态更新**: 机器人状态改为"闲置"
5. **日志记录**: 详细记录退出过程

### 数据管理机制

#### 机器人用户管理
```sql
-- 查看机器人状态分布
SELECT status, COUNT(*) as count 
FROM virtual_user 
GROUP BY status;
-- status: 0=闲置, 1=房间中

-- 获取可用机器人
SELECT user_id, nickname, avatar_url, gender 
FROM virtual_user 
WHERE status = 0 
ORDER BY RAND() 
LIMIT 2;

-- 监控机器人状态自动重置（getTableList.js集成功能）
SELECT user_id, nickname, status, 
       CASE 
         WHEN status = 0 THEN '闲置'
         WHEN status = 1 THEN '房间中'
         ELSE '未知'
       END as status_text,
       updated_at
FROM virtual_user 
WHERE updated_at >= DATE_SUB(NOW(), INTERVAL 2 HOUR)
ORDER BY updated_at DESC;
```

#### 桌局状态管理
```sql
-- 查看活跃机器人桌局
SELECT id, host_id, participants, req_num, start_time, store_id
FROM table_list 
WHERE is_robot_table = 1 
  AND status = 0
  AND TIMESTAMPDIFF(HOUR, create_time, NOW()) <= 2
  AND start_time >= NOW();
```

## 🔧 集成接口

### 加入房间接口集成
在 `routes/mahjong/enterRoom.js` 中集成了机器人清理逻辑：

```javascript
// 当房间人数达到req_num时，清理机器人
const cleanVirtualUsersOnJoin = async (roomId, reqNum) => {
  // 检查是否有机器人
  // 调用leaveRoom处理房主切换
  // 更新机器人状态为闲置（status = 0）
};
```

### 桌局列表接口集成
在 `routes/mahjong/getTableList.js` 中实现了完整的虚拟用户管理：

```javascript
// 1. 根据user_id获取用户信息
// 如果user_id < 0，从virtual_user表获取
// 如果user_id > 0，从users表获取

// 2. 房间过期时自动重置虚拟用户状态
const { realUsers, virtualUsers } = separateUserIds(uniqueUserIds);

// 更新真实用户状态
if (realUsers.length > 0) {
  await connection.execute(
    `UPDATE users SET status = 0, enter_room_id = NULL WHERE user_id IN (?)`,
    realUsers
  );
}

// 更新虚拟用户状态
if (virtualUsers.length > 0) {
  await connection.execute(
    `UPDATE virtual_user SET status = 0, updated_at = NOW() WHERE user_id IN (?)`,
    virtualUsers
  );
}
```

## 📊 监控与维护

### 日志系统
系统提供两种日志文件：

#### 系统运行日志 (`scheduler.log`)
```
[2024-01-01 12:00:00] 🤖 开始执行机器人桌局管理任务
[2024-01-01 12:00:01] 当前状态: 桌局2桌
[2024-01-01 12:00:02] 创建机器人桌局成功: ID=123, 机器人数=2, 门店=1
[2024-01-01 12:00:03] ✅ 机器人桌局管理任务执行完成
```

#### 桌局创建日志 (`table_creation.log`)
```json
[2024-01-01 12:00:02] {"roomId":123,"storeId":1,"robotCount":2,"startTime":"2024-01-01T13:30:00.000Z"}
```

### 监控命令
```bash
# 实时查看系统日志
tail -f scripts/scheduler.log

# 查看桌局创建日志
tail -f scripts/table_creation.log

# PM2进程监控
pm2 monit
pm2 logs robot-scheduler

# 数据库监控
mysql -h127.0.0.1 -uroot -p791204 myapp -e "
SELECT 
  COUNT(*) as total_tables,
  SUM(CASE WHEN is_robot_table = 1 THEN 1 ELSE 0 END) as robot_tables
FROM table_list WHERE status = 0;"
```

## 🛠️ 自定义配置

### 修改机器人行为
```javascript
// 调整退出概率
exitProbability: 0.6,  // 提高到60%

// 调整创建间隔
createInterval: 3,     // 缩短到3分钟

// 调整工作时间
workStartHour: 8,       // 提前到8点开始
workEndHour: 24,       // 延长到24点结束
```

### 修改机器人数据池
```sql
-- 批量添加机器人用户
INSERT INTO virtual_user (user_id, nickname, avatar_url, gender, status, created_at, updated_at) VALUES
(-5001, '阿健', 'https://example.com/avatar1.jpg', 1, 0, NOW(), NOW()),
(-5002, '小陈', 'https://example.com/avatar2.jpg', 2, 0, NOW(), NOW()),
(-5003, '阿姨姐', 'https://example.com/avatar3.jpg', 2, 0, NOW(), NOW());

-- 更新机器人信息
UPDATE virtual_user 
SET nickname = '新昵称', avatar_url = '新头像URL' 
WHERE user_id = -5001;
```

### 门店管理
```sql
-- 查看门店状态
SELECT id, name, status FROM stores;

-- 设置门店营业状态
UPDATE stores SET status = 1 WHERE id IN (1, 2, 3);
```

## 🚨 故障排除

### 常见问题诊断

#### 1. 系统不启动
```bash
# 检查Node.js版本
node --version

# 检查依赖安装
yarn list

# 检查环境变量
cat .env

# 手动执行调试
node scripts/scheduler.js
```

#### 2. 桌局不创建
```bash
# 检查系统日志
grep "创建机器人桌局" scripts/scheduler.log | tail -10

# 检查数据库连接
mysql -h127.0.0.1 -uroot -p791204 myapp -e "SELECT NOW()"

# 检查资源状态
mysql -h127.0.0.1 -uroot -p791204 myapp -e "
SELECT 
  (SELECT COUNT(*) FROM virtual_user WHERE status = 0) as available_robots,
  (SELECT COUNT(*) FROM stores WHERE status = 1) as active_stores,
  (SELECT COUNT(*) FROM table_list WHERE status = 0) as active_tables;"
```

#### 3. 机器人不退出
```bash
# 查看退出逻辑日志
grep "机器人退出" scripts/scheduler.log | tail -20

# 检查桌局参与者
mysql -h127.0.0.1 -uroot -p791204 myapp -e "
SELECT id, participants, req_num, is_robot_table 
FROM table_list 
WHERE is_robot_table = 1 AND status = 0;"
```

### 紧急恢复方案
```bash
# 1. 停止机器人管理
pm2 stop robot-scheduler

# 2. 重置机器人状态
mysql -h127.0.0.1 -uroot -p791204 myapp -e "
UPDATE virtual_user SET status = 0 WHERE status = 1;"

# 3. 清理异常桌局（谨慎操作）
mysql -h127.0.0.1 -uroot -p791204 myapp -e "
UPDATE table_list SET status = 1 
WHERE is_robot_table = 1 AND status = 0 AND create_time < DATE_SUB(NOW(), INTERVAL 3 HOUR);"

# 4. 重启系统
pm2 start robot-scheduler
```

## 📈 性能优化建议

### 1. 数据库优化
```sql
-- 添加索引提升查询性能
CREATE INDEX idx_virtual_user_status ON virtual_user(status);
CREATE INDEX idx_table_list_robot_status ON table_list(is_robot_table, status);
CREATE INDEX idx_table_list_create_time ON table_list(create_time);
```

### 2. 系统优化
- 定期清理日志文件（建议保留7天）
- 监控内存使用情况
- 设置PM2自动重启策略
- 配置数据库连接池

### 3. 业务优化
- 根据用户行为数据调整退出策略
- 定期更新机器人头像和昵称池
- 监控桌局成局率和用户满意度

## 📞 技术支持

### 联系方式
- **系统日志**: `scripts/scheduler.log`
- **部署文档**: `scripts/DEPLOYMENT_SUMMARY.md`
- **开发团队**: 请通过内部渠道联系

### 版本信息
- **当前版本**: v2.1
- **最后更新**: 2024年
- **主要特性**: 智能退出、时间优化、房主切换、完整虚拟用户状态管理

---

**🎉 系统已准备就绪，开始为您的麻将小程序提供智能化服务！**
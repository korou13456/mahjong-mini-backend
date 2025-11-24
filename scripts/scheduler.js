// scheduler.js - 机器人桌局管理系统
require("dotenv").config();
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const db = require("../config/database");

// 日志文件路径
const logFile = path.join(__dirname, "scheduler.log");
const tableLogFile = path.join(__dirname, "table_creation.log");

/**
 * 机器人配置
 */
const ROBOT_CONFIG = {
  // 触发条件
  maxTableCount: 3, // 桌局总数 < 3 桌时自动补
  createInterval: 5, // 每次创建至少间隔5分钟

  // 时间段
  workStartHour: 01, // 工作开始时间 10:00
  workEndHour: 23, // 工作结束时间 18:00

  // 机器人退出条件
  exitDelayMin: 10, // 最近用户加入后至少等待10分钟
  exitProbability: 0.4, // 退出概率 70%
  exitDelaySeconds: {
    // 退出延迟时间（秒）
    min: 10,
    max: 45,
  },
};

/**
 * 获取可用门店列表
 */
async function getAvailableStores() {
  try {
    const [stores] = await db.execute("SELECT id FROM stores WHERE status = 1");
    return stores.map((store) => store.id);
  } catch (error) {
    log(`获取门店列表失败: ${error.message}`);
    return [1]; // 默认返回门店ID 1
  }
}

/**
 * 格式化时间 YYYY-MM-DD HH:mm:ss
 */
function formatTime(date = new Date()) {
  const pad = (n) => (n < 10 ? "0" + n : n);

  const Y = date.getFullYear();
  const M = pad(date.getMonth() + 1);
  const D = pad(date.getDate());
  const h = pad(date.getHours());
  const m = pad(date.getMinutes());
  const s = pad(date.getSeconds());

  return `${Y}-${M}-${D} ${h}:${m}:${s}`;
}

/**
 * 写入日志
 */
function log(message) {
  const timestamp = formatTime();
  const logEntry = `[${timestamp}] ${message}\n`;

  console.log(logEntry.trim());

  try {
    fs.appendFileSync(logFile, logEntry);
  } catch (error) {
    console.error("写入日志失败:", error);
  }
}

/**
 * 写入桌局创建日志
 */
function logTableCreation(tableData) {
  const timestamp = formatTime();
  const logEntry = `[${timestamp}] ${JSON.stringify(tableData)}\n`;

  console.log(`桌局创建日志: ${JSON.stringify(tableData)}`);

  try {
    fs.appendFileSync(tableLogFile, logEntry);
  } catch (error) {
    console.error("写入桌局日志失败:", error);
  }
}

/**
 * 从虚拟用户表获取随机机器人用户
 */
async function getRandomRobotUsers(count = 1) {
  try {
    const [availableRobots] = await db.execute(
      `SELECT user_id, nickname, avatar_url, gender FROM virtual_user WHERE status = 0 ORDER BY RAND() LIMIT ${count}`
    );

    if (availableRobots.length < count) {
      log(`可用机器人不足: 需要${count}个，可用${availableRobots.length}个`);
      return [];
    }

    // 更新机器人状态为房间中
    for (const robot of availableRobots) {
      await db.execute(
        "UPDATE virtual_user SET status = 1, updated_at = NOW() WHERE user_id = ?",
        [robot.user_id]
      );
    }

    log(`从虚拟用户表获取${availableRobots.length}个机器人用户`);
    return availableRobots.map((robot) => ({
      user_id: robot.user_id,
      nickname: robot.nickname,
      avatar: robot.avatar_url,
      gender: robot.gender,
      is_robot: true,
    }));
  } catch (error) {
    log(`获取机器人失败: ${error.message}`);
    return [];
  }
}

/**
 * 检查是否在工作时间
 */
function isWorkingHours() {
  const now = new Date();
  const hour = now.getHours();
  return hour >= ROBOT_CONFIG.workStartHour && hour <= ROBOT_CONFIG.workEndHour;
}

/**
 * 获取当前桌局总数（使用getTableList的逻辑）
 */
async function getCurrentTableCount() {
  try {
    const [rows] = await db.execute(
      `SELECT COUNT(*) as count 
       FROM table_list 
       WHERE status = 0
         AND TIMESTAMPDIFF(HOUR, create_time, NOW()) <= 2
         AND start_time >= NOW()`
    );
    return rows[0].count;
  } catch (error) {
    log(`获取桌局总数失败: ${error.message}`);
    return 0;
  }
}

/**
 * 检查是否可以创建机器人桌局
 */
async function canCreateRobotTable() {
  // 检查工作时间

  if (!isWorkingHours()) {
    return false;
  }

  // 获取桌局总数
  const tableCount = await getCurrentTableCount();

  log(`当前状态: 桌局${tableCount}桌`);

  // 检查触发条件：桌局总数 < 3 桌
  return tableCount < ROBOT_CONFIG.maxTableCount;
}

/**
 * 创建机器人桌局
 */
async function createRobotTable() {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 获取机器人用户
    const robotCount = Math.random() > 0.5 ? 1 : 2; // 随机1-2个机器人
    const robots = await getRandomRobotUsers(robotCount);

    if (robots.length === 0) {
      log("没有可用的机器人，跳过创建桌局");
      await connection.rollback();
      return null;
    }

    // 获取可用门店并随机选择
    const availableStores = await getAvailableStores();
    if (availableStores.length === 0) {
      log("没有可用的门店，跳过创建桌局");
      await connection.rollback();
      return null;
    }

    const storeId =
      availableStores[Math.floor(Math.random() * availableStores.length)];

    // 设置开始时间为1小时之后的下一个半点
    const startTime = new Date();
    startTime.setHours(startTime.getHours() + 1);

    // 调整到下一个半点（向上取整）
    const minutes = startTime.getMinutes();
    if (minutes > 30) {
      // 如果超过30分，调整到下一个小时的00分
      startTime.setHours(startTime.getHours() + 1);
      startTime.setMinutes(0);
    } else if (minutes > 0 && minutes <= 30) {
      // 如果在0-30分之间，调整到30分
      startTime.setMinutes(30);
    } else {
      // 如果正好是0分，调整到30分
      startTime.setMinutes(30);
    }

    startTime.setSeconds(0);
    startTime.setMilliseconds(0);

    // 创建桌局
    const [result] = await connection.execute(
      `INSERT INTO table_list 
       (host_id, pay_type, scoring_tier, special_notes, start_time, store_id, 
        duration, mahjong_type, gender_pref, smoking_pref, req_num, participants, 
        create_time, is_robot_table) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        robots[0].user_id,
        0, // pay_type
        1, // scoring_tier
        "", // special_notes
        startTime,
        storeId,
        1, // duration
        0, // mahjong_type
        0, // gender_pref
        1, // smoking_pref
        4, // req_num
        JSON.stringify(robots.map((r) => r.user_id)),
        new Date(),
        1, // is_robot_table
      ]
    );

    const roomId = result.insertId;
    log(
      `创建机器人桌局成功: ID=${roomId}, 机器人数=${robotCount}, 门店=${storeId}`
    );

    // 记录详细的桌局创建信息
    const tableData = {
      roomId,
      storeId,
      robotCount,
      robots: robots.map((r) => ({
        user_id: r.user_id,
        nickname: r.nickname,
        gender: r.gender,
      })),
      startTime: startTime.toISOString(),
      createTime: new Date().toISOString(),
      payType: 0,
      scoringTier: 0,
      mahjongType: 0,
      genderPref: Math.random() > 0.5 ? 0 : 2,
      smokingPref: 1,
      reqNum: 4,
    };
    logTableCreation(tableData);

    await connection.commit();
    return roomId;
  } catch (error) {
    await connection.rollback();
    log(`创建机器人桌局失败: ${error.message}`);
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * 获取机器人桌局列表
 */
async function getRobotTables() {
  try {
    const [rows] = await db.execute(
      `SELECT * FROM table_list WHERE is_robot_table = 1 AND status = 0`
    );
    return rows;
  } catch (error) {
    log(`获取机器人桌局失败: ${error.message}`);
    return [];
  }
}

/**
 * 分析桌局中的真实用户和机器人数量
 */
function analyzeTableParticipants(participantsData) {
  try {
    // 处理可能是JSON字符串或数组的情况
    let participants;
    if (typeof participantsData === "string") {
      participants = JSON.parse(participantsData);
    } else if (Array.isArray(participantsData)) {
      participants = participantsData;
    } else {
      return { realUserCount: 0, robotCount: 0, total: 0 };
    }

    // virtual_user表中的都是机器人，user_id都是负数
    const robots = participants.filter((id) => id < 0);
    const realUsers = participants.filter((id) => id > 0);

    const result = {
      realUserCount: realUsers.length, // 真实用户数量
      robotCount: robots.length, // 机器人数量
      total: participants.length,
    };

    return result;
  } catch (error) {
    console.log("analyzeTableParticipants错误:", error);
    return { realUserCount: 0, robotCount: 0, total: 0 };
  }
}

/**
 * 检查机器人是否应该退出
 */
function shouldRobotExit(table, analysis) {
  const { realUserCount, robotCount, total } = analysis;
  const reqNum = table.req_num || 4; // 默认4人

  // 没有机器人，不需要退出
  if (robotCount === 0) {
    return false;
  }

  // 检查房间总人数是否达到 req_num - 1（差一个就满员）
  if (total === reqNum - 1) {
    log(
      `房间${table.id}总人数${total}人，需求${reqNum}人，差一个满员，机器人退出`
    );
    return true;
  }

  // 检查人数条件（其他情况）
  let shouldCheckTime = false;

  if (total >= reqNum - 2 && realUserCount >= 1) {
    // 2个或更多真人时，可以退出一个机器人（需要检查时间条件）
    shouldCheckTime = true;
  }

  if (!shouldCheckTime) {
    return false;
  }

  // 检查时间条件（这里简化处理，实际应该记录最后加入时间）
  // 暂时用创建时间代替最后加入时间
  const timeSinceCreate = new Date() - new Date(table.update_time);
  const minWaitTime = ROBOT_CONFIG.exitDelayMin * 60 * 1000;
  if (timeSinceCreate < minWaitTime) {
    return false;
  }

  // 随机概率条件
  if (Math.random() > ROBOT_CONFIG.exitProbability) {
    return false;
  }

  return true;
}

/**
 * 机器人退出桌局
 */
async function robotExitTable(table, analysis) {
  // 获取当前参与者（处理可能是JSON字符串或数组的情况）
  let participants;
  if (typeof table.participants === "string") {
    participants = JSON.parse(table.participants);
  } else if (Array.isArray(table.participants)) {
    participants = table.participants;
  } else {
    log(`房间${table.id}的participants数据格式错误`);
    return;
  }

  // virtual_user表中的都是机器人，user_id都是负数
  const robots = participants.filter((id) => id < 0);

  if (robots.length === 0) {
    log(`房间${table.id}没有机器人可以退出`);
    return;
  }

  // 选择要退出的机器人（第一个）
  const robotToExit = robots[0];

  log(`准备退出机器人: ID=${table.id}, 机器人ID=${robotToExit}, 延迟3秒后执行`);

  // 延迟3秒执行退出
  setTimeout(async () => {
    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // 使用 leaveRoom 方法处理退出逻辑（包含房主切换）
      const { leaveRoom } = require("../utils/roomHelpers");
      const result = await leaveRoom(connection, table.id, robotToExit);

      if (!result.changed) {
        log(`机器人退出失败: ${result.reason}`);
        await connection.rollback();
        return;
      }

      // 更新机器人状态为闲置
      await connection.execute(
        "UPDATE virtual_user SET status = 0, updated_at = NOW() WHERE user_id = ?",
        [robotToExit]
      );

      log(
        `机器人退出桌局: ID=${
          table.id
        }, 退出机器人ID=${robotToExit}, 新房主ID=${
          result.newHostId
        }, 剩余参与者=${(result.participants || []).length}人`
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      log(`机器人退出桌局失败: ${error.message}`);
    } finally {
      connection.release();
    }
  }, 3000); // 3秒延迟
}

/**
 * 处理机器人桌局退出逻辑
 */
async function processRobotTableExits() {
  try {
    const robotTables = await getRobotTables();

    for (const table of robotTables) {
      const analysis = analyzeTableParticipants(table.participants);

      if (shouldRobotExit(table, analysis)) {
        await robotExitTable(table, analysis);
      }
    }
  } catch (error) {
    log(`处理机器人退出失败: ${error.message}`);
  }
}

/**
 * 检查上次创建机器人桌局的时间
 */
async function getLastRobotTableCreateTime() {
  try {
    const [rows] = await db.execute(
      `SELECT create_time FROM table_list WHERE is_robot_table = 1 ORDER BY create_time DESC LIMIT 1`
    );
    return rows.length > 0 ? rows[0].create_time : null;
  } catch (error) {
    log(`获取上次创建时间失败: ${error.message}`);
    return null;
  }
}

/**
 * 检查是否可以创建新的机器人桌局（时间间隔检查）
 */
async function canCreateNewRobotTable() {
  const lastCreateTime = await getLastRobotTableCreateTime();

  if (!lastCreateTime) {
    return true;
  }

  const timeDiff = new Date() - new Date(lastCreateTime);
  const minInterval = ROBOT_CONFIG.createInterval * 60 * 1000; // 转换为毫秒

  return timeDiff >= minInterval;
}

/**
 * 定时执行的业务逻辑
 */
async function executeTask() {
  try {
    log("🤖 开始执行机器人桌局管理任务");

    // 1. 处理机器人退出逻辑
    await processRobotTableExits();

    // 2. 检查是否需要创建新的机器人桌局

    if ((await canCreateRobotTable()) && (await canCreateNewRobotTable())) {
      await createRobotTable();
    } else {
      log("📊 当前不需要创建机器人桌局");
    }

    log("✅ 机器人桌局管理任务执行完成");
  } catch (error) {
    log(`❌ 机器人桌局管理任务执行失败: ${error.message}`);
  }
}

/**
 * 启动定时任务
 */
function startScheduler() {
  log("🤖 机器人桌局管理系统已启动，每 1 分钟执行一次");

  // 立即执行一次
  executeTask();

  // 每 1 分钟执行一次
  // cron 表达式: "0 * * * * *"
  cron.schedule("0 * * * * *", executeTask);

  log("✅ 定时任务设置完成");
}

// 优雅关闭
process.on("SIGINT", () => {
  log("🛑 定时任务已停止（SIGINT）");
  process.exit(0);
});

process.on("SIGTERM", () => {
  log("🛑 定时任务已停止（SIGTERM）");
  process.exit(0);
});

// 直接运行文件时启动调度器
if (require.main === module) {
  startScheduler();
}

module.exports = {
  executeTask,
  startScheduler,
};

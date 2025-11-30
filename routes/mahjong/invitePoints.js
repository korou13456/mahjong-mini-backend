// routes/mahjong/invitePoints.js
const db = require("../../config/database");
const { extractUserIdFromToken } = require("../../utils/tokenHelpers");

// 通用查询一条
async function queryOne(conn, sql, params) {
  const [rows] = await conn.query(sql, params);
  return rows[0] || null;
}

// 记录积分日志
async function recordPointLog(
  conn,
  type,
  score,
  guid,
  user_id,
  source,
  ifRepeat = true
) {
  // 检查是否已存在相同记录（防止重复）
  let existingLog = false;
  if (ifRepeat) {
    existingLog = await queryOne(
      conn,
      `SELECT id FROM user_point_log WHERE type = ? AND guid = ? AND source = ?`,
      [type, guid, source]
    );
  }

  if (existingLog) {
    return { success: false, message: "积分记录已存在" };
  }

  // 插入积分记录
  await conn.execute(
    `INSERT INTO user_point_log (type, score, guid, user_id, source) 
     VALUES (?, ?, ?, ?, ?)`,
    [type, score, guid || "", user_id || null, source || null]
  );
  await updateUserScoreSummary(conn, source, score);

  return { success: true };
}

// 更新用户积分聚合表
async function updateUserScoreSummary(conn, userId, score = 0) {
  // 查询用户是否已有积分记录
  const existingSummary = await queryOne(
    conn,
    `SELECT * FROM user_score_summary WHERE user_id = ?`,
    [userId]
  );

  if (existingSummary) {
    // 检查更新时间是否是今天
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const lastUpdateDate = existingSummary.updated_at
      .toISOString()
      .split("T")[0];

    if (lastUpdateDate === today) {
      // 如果是今天，累加today_score
      await conn.execute(
        `UPDATE user_score_summary 
         SET total_score = total_score + ?, 
             today_score = today_score + ?,
             updated_at = NOW()
         WHERE user_id = ?`,
        [score, score, userId]
      );
    } else {
      // 如果不是今天，重置today_score为当前分数
      await conn.execute(
        `UPDATE user_score_summary 
         SET total_score = total_score + ?, 
             today_score = ?,
             updated_at = NOW()
         WHERE user_id = ?`,
        [score, score, userId]
      );
    }
  } else {
    // 创建新记录
    await conn.execute(
      `INSERT INTO user_score_summary 
       (user_id, total_score, today_score, created_at, updated_at) 
       VALUES (?, ?, ?, NOW(), NOW())`,
      [userId, score, score]
    );
  }
}

// 新用户注册奖励积分
async function newUserRegisterReward(conn, userId, guid, inviteSource = null) {
  // 只给邀请者加分，新用户不加分
  if (inviteSource) {
    const inviteScore = 20; // 邀请奖励30分
    const inviteType = 3; // 邀请积分类型

    await recordPointLog(
      conn,
      inviteType,
      inviteScore,
      guid,
      userId,
      inviteSource
    );

    return {
      registerScore: 0,
      inviteScore: inviteScore,
    };
  }

  return {
    registerScore: 0,
    inviteScore: 0,
  };
}

// 用户组成桌局奖励积分（每日只能一次）
async function completeTableReward(conn, userId, guid) {
  const tableScore = 50; // 组成桌局奖励50分
  const tableType = 4; // 桌局积分类型

  // 检查今天是否已经获得过桌局积分
  const todayRecord = await queryOne(
    conn,
    `SELECT id FROM user_point_log 
     WHERE user_id = ? AND type = ? AND DATE(created_at) = CURDATE()`,
    [userId, tableType]
  );

  if (todayRecord) {
    return {
      success: false,
      message: "今日已获得桌局积分奖励",
      tableScore: 0,
    };
  }

  // 记录积分日志
  await recordPointLog(
    conn,
    tableType,
    tableScore,
    guid,
    userId,
    userId,
    false
  );

  return {
    success: true,
    message: "桌局积分奖励成功",
    tableScore: tableScore,
  };
}

// 邀请新用户完成桌局奖励（给邀请人加分）
async function inviteUserCompleteTableReward(conn, userId, guid) {
  const inviteTableScore = 80; // 邀请新用户完成桌局奖励80分
  const inviteTableType = 5; // 桌局积分类型

  // 查询用户的邀请来源
  const user = await queryOne(
    conn,
    `SELECT source FROM users WHERE user_id = ? AND source IS NOT NULL`,
    [userId]
  );

  if (!user || !user.source) {
    return {
      success: false,
      message: "用户无邀请来源",
      inviteTableScore: 0,
    };
  }

  const inviterId = user.source;

  // 检查是否已经给邀请人加过分（针对这个被邀请用户，只能加一次）
  const existingRecord = await queryOne(
    conn,
    `SELECT id FROM user_point_log 
     WHERE user_id = ? AND type = ? AND source = ?`,
    [inviterId, inviteTableType, userId]
  );

  if (existingRecord) {
    return {
      success: false,
      message: "已给邀请人加过分（只能加一次）",
      inviteTableScore: 0,
    };
  }

  // 记录积分日志（user_id是邀请人ID，source是被邀请人ID）
  await recordPointLog(
    conn,
    inviteTableType,
    inviteTableScore,
    guid,
    inviterId,
    userId
  );

  return {
    success: true,
    message: "邀请新用户完成桌局积分奖励成功",
    inviteTableScore: inviteTableScore,
    inviterId: inviterId,
  };
}

// 分享积分奖励（每天最多十次）
async function shareReward(conn, userId, guid) {
  const shareScore = 1; // 分享奖励1分
  const shareType = 6; // 分享积分类型

  // 检查今天已经获得过多少次分享积分
  const [todayRecords] = await conn.query(
    `SELECT COUNT(*) as count FROM user_point_log 
     WHERE user_id = ? AND type = ? AND DATE(created_at) = CURDATE()`,
    [userId, shareType]
  );

  const todayCount = todayRecords[0]?.count || 0;

  if (todayCount >= 10) {
    return {
      success: false,
      message: "今日分享积分已达上限（5次）",
      shareScore: 0,
      todayCount: todayCount,
    };
  }

  // 记录积分日志
  await recordPointLog(
    conn,
    shareType,
    shareScore,
    guid,
    userId,
    userId,
    false
  );

  return {
    success: true,
    message: "分享积分奖励成功",
    shareScore: shareScore,
    todayCount: todayCount + 1,
  };
}

// 完善信息积分奖励（仅首次）
async function completeInfoReward(conn, userId, guid) {
  const completeInfoScore = 3; // 完善信息奖励3分
  const completeInfoType = 7; // 完善信息积分类型

  // 检查是否已经获得过完善信息积分
  const existingRecord = await queryOne(
    conn,
    `SELECT id FROM user_point_log 
     WHERE user_id = ? AND type = ?`,
    [userId, completeInfoType]
  );

  if (existingRecord) {
    return {
      success: false,
      message: "已获得过完善信息积分奖励（仅首次）",
      completeInfoScore: 0,
    };
  }

  // 记录积分日志
  await recordPointLog(
    conn,
    completeInfoType,
    completeInfoScore,
    guid,
    userId,
    userId
  );

  return {
    success: true,
    message: "完善信息积分奖励成功",
    completeInfoScore: completeInfoScore,
  };
}

// 获取用户积分信息
async function getUserScoreSummary(conn, userId) {
  return await queryOne(
    conn,
    `SELECT * FROM user_score_summary WHERE user_id = ?`,
    [userId]
  );
}

// 获取用户积分历史记录
const getPointHistory = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const userId = req.user.userId;

    // 查询用户积分历史记录，按创建时间倒序
    const [historyRecords] = await connection.execute(
      `SELECT type, score, created_at FROM user_point_log 
       WHERE source = ? 
       ORDER BY created_at DESC`,
      [userId]
    );

    // 定义type对应的title映射
    const typeTitleMap = {
      1: "邀请成功",
      2: "成功组局",
      3: "邀请用户注册账号",
      4: "完成一次桌局（每日一次）",
      5: "邀请新用户完成桌局",
      6: "分享积分奖励",
      7: "完善信息积分奖励",
    };

    // 按日期分组
    const groupedData = {};
    historyRecords.forEach((record) => {
      const date = record.created_at.toISOString().split("T")[0]; // 获取日期部分 YYYY-MM-DD
      const time = record.created_at
        .toTimeString()
        .split(" ")[0]
        .substring(0, 5); // 获取时间部分 HH:MM

      if (!groupedData[date]) {
        groupedData[date] = [];
      }

      groupedData[date].push({
        title: typeTitleMap[record.type] || `类型${record.type}`,
        score: record.score,
        createTime: time,
      });
    });

    // 转换为目标格式数组
    const result = Object.keys(groupedData).map((date) => ({
      date: date,
      data: groupedData[date],
    }));

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("获取积分历史失败:", error);
    res.status(500).json({
      success: false,
      message: "服务器内部错误",
    });
  } finally {
    connection.release();
  }
};

// 主接口：记录邀请积分
const invitePoints = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const guid = req.headers.guid;
    const { source } = req.body;

    if (!guid || !source) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "缺少必要参数：guid, source",
      });
    }
    const currentUserId = extractUserIdFromToken(req);
    // 判断是否有currentUserId，如果有说明用户已登录，不是新用户
    if (currentUserId) {
      await connection.rollback();
      return res.json({
        success: false,
        message: "用户已登录，不是新用户，不记录积分",
      });
    }

    // 邀请用户打开小程序，每次加10分
    const score = 5;
    const inviteType = 1; // 固定为邀请积分类型

    // 记录积分（source作为获得积分的用户ID，user_id字段为null因为这是直接奖励）
    await recordPointLog(connection, inviteType, score, guid, null, source);

    // 获取用户最新的积分信息
    const userScore = await getUserScoreSummary(connection, source);

    await connection.commit();

    console.log(
      `积分记录成功: 用户ID=${source}, 类型=${inviteType}, 积分=${score}, GUID=${guid}`
    );

    res.json({
      success: true,
      message: "积分记录成功",
      data: {
        userScore: userScore || {
          total_score: score,
          today_score: score,
        },
        score: score,
        type: inviteType,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("记录邀请积分失败:", error);
    res.status(500).json({
      success: false,
      message: "服务器内部错误",
    });
  } finally {
    connection.release();
  }
};

// 分享积分奖励接口
const sharePoints = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const userId = extractUserIdFromToken(req); // 从token中获取用户ID
    const guid = req.headers.guid;

    if (!guid) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "缺少必要参数：guid",
      });
    }

    // 调用分享积分奖励函数
    const result = await shareReward(connection, userId, guid);

    if (!result.success) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: result.message,
        data: {
          todayCount: result.todayCount,
          maxCount: 5,
        },
      });
    }

    // 获取用户最新的积分信息
    const userScore = await getUserScoreSummary(connection, userId);

    await connection.commit();

    console.log(
      `分享积分奖励成功: 用户ID=${userId}, 积分=${result.shareScore}, GUID=${guid}, 今日第${result.todayCount}次`
    );

    res.json({
      success: true,
      message: result.message,
      data: {
        userScore: userScore || {
          total_score: result.shareScore,
          today_score: result.shareScore,
        },
        score: result.shareScore,
        type: 6,
        todayCount: result.todayCount,
        maxCount: 5,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("记录分享积分失败:", error);
    res.status(500).json({
      success: false,
      message: "服务器内部错误",
    });
  } finally {
    connection.release();
  }
};

// 获取用户积分汇总
const getScoreSummary = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const userId = req.user.userId;

    // 获取用户积分信息
    const userScore = await getUserScoreSummary(connection, userId);

    // 获取用户基本信息
    const [userResult] = await connection.execute(
      `SELECT nickname, avatar_url FROM users WHERE user_id = ?`,
      [userId]
    );
    const userInfo = userResult[0] || {};

    // 获取用户排名
    const [rankResult] = await connection.execute(
      `SELECT COUNT(*) + 1 as userRank 
       FROM user_score_summary 
       WHERE total_score > COALESCE((SELECT total_score FROM user_score_summary WHERE user_id = ?), 0)`,
      [userId]
    );

    const userRank = rankResult[0]?.userRank || 0;

    // 获取总用户数
    const [totalUsersResult] = await connection.execute(
      `SELECT COUNT(*) as total FROM user_score_summary`
    );
    const totalUsers = totalUsersResult[0]?.total || 0;

    // 获取今天的日期
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // 检查更新时间是否是今天，决定今日积分显示
    let todayScore = 0;
    if (userScore?.updated_at) {
      const lastUpdateDate = userScore.updated_at.toISOString().split("T")[0];
      todayScore = lastUpdateDate === today ? userScore?.today_score || 0 : 0;
    }

    res.json({
      success: true,
      data: {
        userId: userId,
        nickname: userInfo.nickname || "",
        avatarUrl: userInfo.avatar_url || "",
        totalScore: userScore?.total_score || 0,
        todayScore: todayScore,
        rank: userRank,
        totalUsers: totalUsers,
      },
    });
  } catch (error) {
    console.error("获取积分汇总失败:", error);
    res.status(500).json({
      success: false,
      message: "服务器内部错误",
    });
  } finally {
    connection.release();
  }
};

// 获取积分榜前十数据
const getScoreRanking = async (req, res) => {
  const connection = await db.getConnection();

  try {
    // 查询积分榜前十，直接使用JOIN优化查询
    const [topUsers] = await connection.execute(
      `SELECT 
        us.user_id as userId,
        us.total_score as totalScore,
        us.today_score as todayScore,
        us.updated_at as updatedAt,
        u.nickname,
        u.avatar_url as avatarUrl
       FROM user_score_summary us
       LEFT JOIN users u ON us.user_id = u.user_id
       ORDER BY us.total_score DESC, us.updated_at ASC
       LIMIT 10`
    );

    // 获取今天的日期
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // 添加排名
    const ranking = topUsers.map((user, index) => {
      // 检查更新时间是否是今天
      const lastUpdateDate = user.updatedAt.toISOString().split("T")[0];
      const todayScore = lastUpdateDate === today ? user.todayScore : 0;

      return {
        userId: user.userId,
        totalScore: user.totalScore,
        todayScore: todayScore,
        updatedAt: user.updatedAt,
        rank: index + 1,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
      };
    });

    res.json({
      success: true,
      ranking,
    });
  } catch (error) {
    console.error("获取积分榜失败:", error);
    res.status(500).json({
      success: false,
      message: "服务器内部错误",
    });
  } finally {
    connection.release();
  }
};

module.exports = {
  invitePoints,
  getPointHistory,
  getScoreSummary,
  getScoreRanking,
  newUserRegisterReward,
  completeTableReward,
  inviteUserCompleteTableReward,
  completeInfoReward,
  sharePoints,
};

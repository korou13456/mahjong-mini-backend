// routes/mahjong/enterRoom.js
const db = require("../../config/database");
const {
  leaveRoom,
  joinRoom,
  parseParticipants,
  encodeRoomId,
} = require("../../utils/roomHelpers");
const { pushMessage } = require("../../utils/wechat");

// 通用查询一条
async function queryOne(conn, sql, params) {
  const [rows] = await conn.query(sql, params);
  return rows[0] || null;
}

// 配置读取
async function loadConfigs() {
  const sql = `
    SELECT config_key AS configKey, config_id AS id, config_value AS value
    FROM configs
    WHERE config_key IN (1, 2)
    ORDER BY config_key, config_id
  `;
  const [results] = await db.execute(sql);

  const config = { mahjongType: [], duration: [] };

  results.forEach((item) => {
    if (item.configKey === 1) config.mahjongType.push(item);
    if (item.configKey === 2) config.duration.push(item);
  });

  return config;
}

function getConfigValue(config, key, id) {
  const item = config[key].find((v) => v.id === Number(id));
  return item ? item.value : null;
}

function formatDateToMDHM(dateInput) {
  const date = new Date(dateInput);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

// 加入房间时清理虚拟用户
async function cleanVirtualUsersOnJoin(conn, tableId, newUserId) {
  // 查询房间当前参与者和需求人数
  const table = await queryOne(
    conn,
    `SELECT participants, req_num FROM table_list WHERE id = ? AND status = 0`,
    [tableId]
  );

  if (!table) return;

  const participantIds = parseParticipants(table.participants);
  const reqNum = table.req_num || 4; // 默认4人
  
  if (!participantIds.length) return;

  // 当房间人数等于req_num时，检查是否有虚拟用户
  if (participantIds.length === reqNum) {
    // 识别虚拟用户（user_id < 0）
    const robots = participantIds.filter((id) => id < 0);
    
    if (robots.length > 0) {
      // 踢出去一个虚拟用户（第一个）
      const robotToExit = robots[0];

      // 使用 leaveRoom 方法处理退出逻辑（包含房主切换）
      const { leaveRoom } = require("../../utils/roomHelpers");
      const result = await leaveRoom(conn, tableId, robotToExit);

      if (!result.changed) {
        console.log(`机器人退出失败: ${result.reason}`);
        return;
      }

      // 更新被踢出的机器人状态为闲置
      await conn.query(
        "UPDATE virtual_user SET status = 0, updated_at = NOW() WHERE user_id = ?",
        [robotToExit]
      );

      console.log(`房间满员清理虚拟用户: 桌局ID=${tableId}, 当前人数=${participantIds.length}, 需求人数=${reqNum}, 踢出机器人ID=${robotToExit}, 新房主ID=${result.newHostId}, 剩余参与者=${(result.participants || []).length}人`);
    }
  }
}

// 成局逻辑抽离
async function handleMatchSuccess(conn, tableId) {
  // 查询房间信息
  const table = await queryOne(
    conn,
    `SELECT * FROM table_list WHERE id = ?`,
    [tableId]
  );
  
  if (!table) {
    console.error(`房间不存在: tableId=${tableId}`);
    return;
  }

  // 解析最终参与者
  const finalParticipants = parseParticipants(table.participants);

  // 更新状态
  await conn.query(
    `UPDATE table_list SET status = 1, start_match_time = NOW() WHERE id = ?`,
    [tableId]
  );

  // 更新真实玩家状态（只更新正数ID的用户）
  const realUsers = finalParticipants.filter((id) => id > 0);
  if (realUsers.length > 0) {
    await conn.query(
      `UPDATE users SET status = 0, enter_room_id = NULL WHERE user_id IN (?)`,
      [realUsers]
    );
  }

  // 插入 game_sessions（只插入真实玩家）
  const insertValues = realUsers.map((uid) => [tableId, uid, 0]);
  if (insertValues.length > 0) {
    await conn.query(
      `INSERT INTO game_sessions (table_id, user_id, status) VALUES ?`,
      [insertValues]
    );
  }

  // 查商家
  const storeDetail = await queryOne(
    conn,
    `SELECT user_id, store_name, address_detail, manager_phone FROM stores WHERE id = ?`,
    [table.store_id]
  );

  // 解析管理员用户ID数组
  let adminUserIds = [];
  if (storeDetail) {
    try {
      adminUserIds = Array.isArray(storeDetail.user_id)
        ? storeDetail.user_id
        : JSON.parse(storeDetail.user_id || "[]");
    } catch (e) {
      console.warn("解析store user_id失败:", e.message);
      adminUserIds = [];
    }
  }

  // 查询所有管理员的service_openid
  let adminOpenids = [];
  if (adminUserIds.length > 0) {
    const placeholders = adminUserIds.map(() => "?").join(",");
    const [adminRows] = await conn.query(
      `SELECT service_openid FROM users WHERE user_id IN (${placeholders}) AND service_openid IS NOT NULL`,
      adminUserIds
    );
    console.log(adminRows, "!====>>adminRows");
    adminOpenids = adminRows.map((row) => row.service_openid).filter(Boolean);
  }

  // 查玩家（只查询真实玩家）
  const [userRows] = await conn.query(
    `SELECT service_openid, nickname FROM users WHERE user_id IN (?)`,
    [realUsers]
  );

  // 配置
  const config = await loadConfigs();
  const title = `${getConfigValue(
    config,
    "mahjongType",
    table.mahjong_type
  )}·${formatDateToMDHM(table.start_time)}`;

  const miniAppId = process.env.WECHAT_APPID || "";
  const adminMiniProgram = miniAppId
    ? {
        appid: miniAppId,
        pagepath: "/pages/admin/admin-table-detail/index?id=" + tableId,
      }
    : null;

  // 推送给所有管理员
  for (const adminOpenid of adminOpenids) {
    await pushMessage(
      "TABLE_SUCCES_USER",
      adminOpenid,
      {
        tableId: encodeRoomId(tableId),
        roomTitle: title,
        storeName: storeDetail?.store_name || "未知商家",
        storeAddress: storeDetail?.address_detail || "地址未知",
        storePhone: storeDetail?.manager_phone || "电话未知",
      },
      "",
      adminMiniProgram
    );
  }

  // 推送给每个玩家
  for (const user of userRows) {
    if (!user.service_openid) continue;

    const miniProgram = miniAppId
      ? {
          appid: miniAppId,
          pagepath: "pages/table-detail/index?id=" + tableId,
        }
      : null;

    await pushMessage(
      "TABLE_SUCCES_USER",
      user.service_openid,
      {
        tableId: encodeRoomId(tableId),
        roomTitle: title,
        storeName: storeDetail.store_name,
        storeAddress: storeDetail.address_detail,
        storePhone: storeDetail.manager_phone,
      },
      "",
      miniProgram
    );
  }
}

// -----------------------------------------------------

const enterRoom = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { tableId, currentTableId } = req.body;
    const userId = req.user.userId;

    if (!tableId)
      return res.status(400).json({
        success: false,
        message: "缺少必要参数：tableId",
      });

    if (currentTableId) {
      await leaveRoom(connection, currentTableId, userId);
    }

    // 查询房间的最大人数
    const tableInfo = await queryOne(
      connection,
      `SELECT req_num FROM table_list WHERE id = ? AND status = 0`,
      [tableId]
    );

    if (!tableInfo) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "目标房间不存在或已失效",
      });
    }

    const maxParticipants = tableInfo.req_num || 4; // 默认4人
    const joinResult = await joinRoom(
      connection,
      tableId,
      userId,
      maxParticipants
    );

    if (joinResult.reason) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message:
          {
            TABLE_NOT_FOUND: "目标房间不存在",
            ALREADY_IN_ROOM: "您已经在该房间中",
            ROOM_FULL: `目标房间已满员（最多${maxParticipants}人）`,
          }[joinResult.reason] || "加入失败",
      });
    }

    // 用户加入成功后，检查是否需要清理虚拟用户
    await cleanVirtualUsersOnJoin(connection, tableId, userId);

    // 重新查询房间参与者数量（清理虚拟用户后）
    const updatedTable = await queryOne(
      connection,
      `SELECT participants FROM table_list WHERE id = ? AND status = 0`,
      [tableId]
    );

    if (updatedTable) {
      const currentParticipants = parseParticipants(updatedTable.participants);
      
      // 满员 → 成局
      if (currentParticipants.length >= maxParticipants) {
        await handleMatchSuccess(connection, tableId);
      }
    }

    await connection.commit();

    res.json({
      success: true,
      message: currentTableId ? "成功切换房间" : "成功加入房间",
    });
  } catch (error) {
    await connection.rollback();
    console.error("切换房间错误:", error);
    res.status(500).json({ success: false, message: "切换房间失败" });
  } finally {
    connection.release();
  }
};

module.exports = enterRoom;

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

// 成局逻辑抽离
async function handleMatchSuccess(conn, tableId) {
  // 更新状态
  await conn.query(
    `UPDATE table_list SET status = 1, start_match_time = NOW() WHERE id = ?`,
    [tableId]
  );

  // 查询房间玩家
  const table = await queryOne(
    conn,
    `SELECT participants, store_id, mahjong_type, start_time, duration FROM table_list WHERE id = ?`,
    [tableId]
  );

  const participantIds = parseParticipants(table.participants);
  if (!participantIds.length) return;

  // 更新玩家状态
  await conn.query(
    `UPDATE users SET status = 0, enter_room_id = NULL WHERE user_id IN (?)`,
    [participantIds]
  );

  // 插入 game_sessions
  const insertValues = participantIds.map((uid) => [tableId, uid, 0]);
  await conn.query(
    `INSERT INTO game_sessions (table_id, user_id, status) VALUES ?`,
    [insertValues]
  );

  // 查商家
  const storeDetail = await queryOne(
    conn,
    `SELECT user_id, store_name, address_detail, manager_phone FROM stores WHERE id = ?`,
    [table.store_id]
  );

  // 解析管理员用户ID数组
  let adminUserIds = [];
  try {
    adminUserIds = Array.isArray(storeDetail.user_id)
      ? storeDetail.user_id
      : JSON.parse(storeDetail.user_id || "[]");
  } catch (e) {
    console.warn("解析store user_id失败:", e.message);
    adminUserIds = [];
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

  // 查玩家
  const [userRows] = await conn.query(
    `SELECT service_openid, nickname FROM users WHERE user_id IN (?)`,
    [participantIds]
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
        storeName: storeDetail.store_name,
        storeAddress: storeDetail.address_detail,
        storePhone: storeDetail.manager_phone,
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

    // 满员 → 成局
    if (joinResult.participants_num >= maxParticipants) {
      await handleMatchSuccess(connection, tableId);
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

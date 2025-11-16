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

  // 查管理员用户
  const admin = await queryOne(
    conn,
    `SELECT service_openid FROM users WHERE user_id = ?`,
    [storeDetail.user_id]
  );

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
  )}·${formatDateToMDHM(table.start_time)}·${getConfigValue(
    config,
    "duration",
    table.duration
  )}`;

  const miniAppId = process.env.WX_MINI_APP_ID || "";
  const adminMiniProgram = miniAppId
    ? {
        appid: miniAppId,
        pagepath: "pages/admin-table-detail/index?id=" + tableId,
      }
    : null;

  // 推送给商家
  await pushMessage(
    "TABLE_SUCCES_USER",
    admin.service_openid,
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

    const joinResult = await joinRoom(connection, tableId, userId, 4);

    if (joinResult.reason) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message:
          {
            TABLE_NOT_FOUND: "目标房间不存在",
            ALREADY_IN_ROOM: "您已经在该房间中",
            ROOM_FULL: "目标房间已满员（最多4人）",
          }[joinResult.reason] || "加入失败",
      });
    }

    // 满员 → 成局
    if (joinResult.participants_num >= 4) {
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

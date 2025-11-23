// routes/mahjong/createRoom.js
const db = require("../../config/database");
const { leaveRoom, encodeRoomId } = require("../../utils/roomHelpers");
const { pushMessage } = require("../../utils/wechat");

// 通用查询一条
async function queryOne(conn, sql, params) {
  const [rows] = await conn.query(sql, params);
  return rows[0] || null;
}

// 推送创建房间通知
async function pushCreateRoomNotification(conn, roomId, roomData) {
  try {
    // 查询商家信息
    const storeDetail = await queryOne(
      conn,
      `SELECT user_id, store_name, address_detail, manager_phone FROM stores WHERE id = ?`,
      [roomData.store_id]
    );

    if (!storeDetail) {
      console.warn("未找到商家信息，跳过推送");
      return;
    }

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
      adminOpenids = adminRows.map((row) => row.service_openid).filter(Boolean);
    }

    if (adminOpenids.length === 0) {
      console.warn("未找到有效的管理员openid，跳过推送");
      return;
    }

    const miniAppId = process.env.WECHAT_APPID || "";
    const adminMiniProgram = miniAppId
      ? {
          appid: miniAppId,
          pagepath: "/pages/table-detail/index?id=" + roomId,
        }
      : null;
    console.log(adminOpenids, "!=====>>>adminOpenids");
    // 推送给所有管理员
    for (const adminOpenid of adminOpenids) {
      await pushMessage(
        "TABLE_SUCCES_USER",
        adminOpenid,
        {
          tableId: encodeRoomId(roomId),
          roomTitle: "用户创建了房间",
          storeName: "1",
          storeAddress: "1",
          storePhone: "1",
        },
        "",
        adminMiniProgram
      );
    }

    console.log(`成功推送创建房间通知给${adminOpenids.length}个管理员`);
  } catch (error) {
    console.error("推送创建房间通知失败:", error);
    // 推送失败不影响主流程
  }
}

const createRoom = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const host_id = req.user.userId;
    const {
      pay_type,
      scoring_tier,
      special_notes,
      start_time,
      store_id,
      duration,
      mahjong_type,
      gender_pref = 0,
      currentTableId,
      smoking_pref = 1,
      req_num = 4,
    } = req.body;

    if (!start_time || !store_id) {
      return res.status(400).json({
        code: 500,
        success: false,
        message: "缺少必要参数：start_time、store_id",
      });
    }

    // 先判断用户是否在房间中，如果在，就先退出当前房间
    if (currentTableId) {
      await leaveRoom(connection, currentTableId, host_id);
    }

    // 创建新房间
    const [result] = await connection.execute(
      `INSERT INTO table_list 
       (host_id, pay_type, scoring_tier, special_notes, start_time, store_id, duration, mahjong_type, gender_pref, smoking_pref, req_num, participants) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        host_id,
        pay_type || 0,
        scoring_tier || 0,
        special_notes || "",
        start_time,
        store_id,
        duration || 0,
        mahjong_type || 0,
        gender_pref,
        smoking_pref,
        req_num,
        JSON.stringify([host_id]),
      ]
    );

    const roomId = result.insertId;

    // 更新用户状态为在房间中，并设置进入的房间ID
    await connection.execute(
      "UPDATE users SET status = 1, enter_room_id = ? WHERE user_id = ?",
      [roomId, host_id]
    );

    // 推送创建房间消息给商家管理员
    await pushCreateRoomNotification(connection, roomId, {
      host_id,
      store_id,
      start_time,
      mahjong_type,
      duration,
    });

    await connection.commit();

    res.json({
      code: 200,
      success: true,
      message: "房间创建成功",
      data: {
        room_id: roomId,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("创建房间错误:", error);
    res.status(500).json({
      code: 500,
      success: false,
      message: "创建房间失败",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

module.exports = createRoom;

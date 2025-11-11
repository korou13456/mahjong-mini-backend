// routes/mahjong/enterRoom.js
const db = require("../../config/database");
const {
  leaveRoom,
  joinRoom,
  parseParticipants,
} = require("../../utils/roomHelpers");
const { pushMessage } = require("../../utils/wechat");

const enterRoom = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { tableId, currentTableId } = req.body;
    const userId = req.user.userId;

    if (!tableId) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数：tableId",
      });
    }

    // 1️⃣ 如果用户当前在房间中，先退出
    if (currentTableId) {
      await leaveRoom(connection, currentTableId, userId);
    }

    // 2️⃣ 加入目标房间
    const joinResult = await joinRoom(connection, tableId, userId, 4);

    if (joinResult.reason === "TABLE_NOT_FOUND") {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "目标房间不存在",
      });
    }
    if (joinResult.reason === "ALREADY_IN_ROOM") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "您已经在该房间中",
      });
    }
    if (joinResult.reason === "ROOM_FULL") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "目标房间已满员（最多4人），无法加入",
      });
    }

    // ✅ 当满员时，修改房间状态 + 更新4个用户状态
    if (joinResult.participants_num >= 4) {
      // 1. 更新房间状态为“已成局”，记录成局时间
      const updateRoomSql = `
        UPDATE table_list
        SET status = 1,
            start_match_time = NOW()
        WHERE id = ?
      `;
      await connection.query(updateRoomSql, [tableId]);
      console.log(`房间 ${tableId} 已满员，更新为已成局状态`);

      // 2. 获取该房间的参与者ID（从 participants JSON 字段中取出）
      const [rows] = await connection.query(
        `SELECT participants FROM table_list WHERE id = ?`,
        [tableId]
      );

      if (rows.length && rows[0].participants) {
        const participantIds = parseParticipants(rows[0].participants); // 数组形式的用户ID
        if (Array.isArray(participantIds) && participantIds.length) {
          // 3. 批量更新这些用户的状态为闲置，并清空 enter_room_id
          const updateUsersSql = `
            UPDATE users
            SET status = 0,
                enter_room_id = NULL
            WHERE user_id IN (?)
          `;
          await connection.query(updateUsersSql, [participantIds]);
          console.log(`已将房间 ${tableId} 的玩家状态重置为空闲`);

          // 4. 将这4个用户插入 game_sessions 表
          const insertSql = `
            INSERT INTO game_sessions (table_id, user_id, status)
            VALUES ?
          `;
          const insertValues = participantIds.map((uid) => [tableId, uid, 0]);
          await connection.query(insertSql, [insertValues]);
          console.log(
            `已将房间 ${tableId} 的 ${participantIds.length} 位玩家插入 game_sessions`
          );
        }
        const [userRows] = await connection.query(
          `SELECT service_openid, nickname FROM users WHERE user_id IN (?)`,
          [participantIds]
        );

        for (const user of userRows) {
          if (!user.service_openid) continue;

          const miniAppId = process.env.WX_MINI_APP_ID || "";
          const miniProgram = miniAppId
            ? {
                appid: miniAppId,
                pagepath: "pages/hall/index",
              }
            : null;

          await pushMessage(
            "TABLE_SUCCES_USER", // 注意和模板名对应
            user.service_openid,
            {
              tableId, // 预约码
              roomTitle: "4人已拼成，准备开局", // 订单名称
              nickname: user.nickname, // 你模板里没用但可以传备用
              storeName: "乔斯波麻将馆",
              storeAddress: "莆田市xx路xx号",
              storePhone: 19528427313,
            },
            "", // 服务号网页跳转链接，不用的话空字符串
            miniProgram
          );
        }
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
    res.status(500).json({
      success: false,
      message: "切换房间失败",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

module.exports = enterRoom;

// routes/mahjong/exitRoom.js
const db = require("../../config/database");

// 退出房间
const exitRoom = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { tableId } = req.body;
    const userId = req.user.userId;

    if (!tableId) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数：tableId",
      });
    }

    const [tables] = await connection.execute(
      "SELECT participants, status, host_id FROM `table_list` WHERE id = ?",
      [tableId]
    );

    if (tables.length === 0) {
      return res.status(404).json({
        success: false,
        message: "桌子不存在",
      });
    }

    const table = tables[0];

    let participants = [];

    if (table.participants) {
      if (typeof table.participants === "string") {
        participants = JSON.parse(table.participants);
      } else {
        participants = table.participants;
      }
      // 统一为数字数组，避免字符串/数字混用导致 indexOf 匹配失败
      participants = participants.map((p) => parseInt(p));
    }

    const userIndex = participants.indexOf(parseInt(userId));
    if (userIndex === -1) {
      return res.status(400).json({
        success: false,
        message: "您不在该房间中",
      });
    }

    participants.splice(userIndex, 1);

    // 如果退出的是房主
    let newHostId = table.host_id;
    if (table.host_id === parseInt(userId)) {
      if (participants.length > 0) {
        newHostId = participants[0]; // 有人就换成第一个参与者
      } else {
        newHostId = parseInt(userId); // 没人了，保留最后退出者id作为host_id
      }
    }

    // 如果没人了，房间状态改为3，否则保持原状态
    const newStatus = participants.length === 0 ? 3 : table.status;

    // 更新桌子参与者列表、host_id 和状态
    await connection.execute(
      "UPDATE `table_list` SET participants = ?, host_id = ?, status = ? WHERE id = ?",
      [JSON.stringify(participants), newHostId, newStatus, tableId]
    );

    // 更新用户状态为0（空闲）
    await connection.execute(
      "UPDATE users SET status = 0, enter_room_id = NULL WHERE user_id = ?",
      [userId]
    );

    await connection.commit();

    res.json({
      success: true,
      message: "成功退出房间",
      data: {
        tableId,
        userId,
        currentPlayers: participants.length,
        newHostId,
        newStatus,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("退出房间错误:", error);
    res.status(500).json({
      success: false,
      message: "退出房间失败",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

module.exports = exitRoom;

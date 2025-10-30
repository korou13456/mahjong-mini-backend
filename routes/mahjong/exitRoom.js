const db = require("../../config/database");

// 退出房间
const exitRoom = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const { tableId, userId } = req.body;

    if (!tableId || !userId) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数：tableId 和 userId",
      });
    }

    const [tables] = await connection.execute(
      "SELECT participants, status FROM `table_list` WHERE id = ?",
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
    }

    const userIndex = participants.indexOf(parseInt(userId));
    if (userIndex === -1) {
      return res.status(400).json({
        success: false,
        message: "您不在该房间中",
      });
    }

    participants.splice(userIndex, 1);

    // 更新桌子参与者列表
    await connection.execute(
      "UPDATE `table_list` SET participants = ? WHERE id = ?",
      [JSON.stringify(participants), tableId]
    );

    // 更新用户状态为0（空闲）
    await connection.execute("UPDATE users SET status = 0 WHERE user_id = ?", [
      userId,
    ]);

    await connection.commit();

    res.json({
      success: true,
      message: "成功退出房间",
      data: {
        tableId,
        userId,
        currentPlayers: participants.length,
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

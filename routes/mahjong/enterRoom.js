const db = require("../../config/database");

// 加入房间
const enterRoom = async (req, res) => {
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

    if (table.status !== 0) {
      const statusMap = { 0: "等待中", 1: "进行中", 2: "已结束", 3: "已取消" };
      return res.status(400).json({
        success: false,
        message: `桌子状态为${statusMap[table.status]}，无法加入`,
      });
    }

    let participants = [];

    if (table.participants) {
      if (typeof table.participants === "string") {
        participants = JSON.parse(table.participants);
      } else {
        participants = table.participants;
      }
    }

    if (participants.includes(parseInt(userId))) {
      return res.status(400).json({
        success: false,
        message: "您已经加入该桌子",
      });
    }

    if (participants.length >= 4) {
      return res.status(400).json({
        success: false,
        message: "桌子已满员（最多4人），无法加入",
      });
    }

    participants.push(parseInt(userId));

    await connection.execute(
      "UPDATE `table_list` SET participants = ? WHERE id = ?",
      [JSON.stringify(participants), tableId]
    );

    await connection.execute("UPDATE users SET status = 1 WHERE user_id = ?", [
      userId,
    ]);

    await connection.commit();

    res.json({
      success: true,
      message: "成功加入桌子",
      data: {
        tableId,
        userId,
        currentPlayers: participants.length + 1,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("加入桌子错误:", error);
    res.status(500).json({
      success: false,
      message: "加入桌子失败",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

module.exports = enterRoom;

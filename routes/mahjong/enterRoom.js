const db = require("../../config/database");

// 加入房间/切换房间（合并退出逻辑）
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

    // 1. 如果用户当前在房间中，先退出当前房间（退出逻辑合并）
    if (currentTableId) {
      const [currentTables] = await connection.execute(
        "SELECT participants, status, host_id FROM `table_list` WHERE id = ?",
        [currentTableId]
      );

      if (currentTables.length > 0) {
        const currentTable = currentTables[0];
        let currentParticipants = [];

        if (currentTable.participants) {
          currentParticipants =
            typeof currentTable.participants === "string"
              ? JSON.parse(currentTable.participants)
              : currentTable.participants;
        }

        const userIndex = currentParticipants.indexOf(parseInt(userId));
        if (userIndex !== -1) {
          currentParticipants.splice(userIndex, 1);

          // 如果退出的是房主
          let newHostId = currentTable.host_id;
          if (currentTable.host_id === parseInt(userId)) {
            if (currentParticipants.length > 0) {
              newHostId = currentParticipants[0];
            } else {
              newHostId = parseInt(userId); // 保留最后退出者id
            }
          }

          // 如果没人了，房间状态改为3
          const newStatus =
            currentParticipants.length === 0 ? 3 : currentTable.status;

          // 更新当前房间参与者列表、host_id 和状态
          await connection.execute(
            "UPDATE `table_list` SET participants = ?, host_id = ?, status = ? WHERE id = ?",
            [
              JSON.stringify(currentParticipants),
              newHostId,
              newStatus,
              currentTableId,
            ]
          );

          // 更新用户状态为0（空闲）
          await connection.execute(
            "UPDATE users SET status = 0, enter_room_id = NULL WHERE user_id = ?",
            [userId]
          );
        }
      }
    }

    // 2. 加入目标房间
    const [targetTables] = await connection.execute(
      "SELECT participants FROM `table_list` WHERE id = ?",
      [tableId]
    );

    if (targetTables.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "目标房间不存在",
      });
    }

    const targetTable = targetTables[0];
    let targetParticipants = [];

    if (targetTable.participants) {
      targetParticipants =
        typeof targetTable.participants === "string"
          ? JSON.parse(targetTable.participants)
          : targetTable.participants;
    }

    // 检查是否已在目标房间
    if (targetParticipants.includes(parseInt(userId))) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "您已经在该房间中",
      });
    }

    // 检查目标房间是否满员
    if (targetParticipants.length >= 4) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "目标房间已满员（最多4人），无法加入",
      });
    }

    targetParticipants.push(parseInt(userId));
    await connection.execute(
      "UPDATE `table_list` SET participants = ? WHERE id = ?",
      [JSON.stringify(targetParticipants), tableId]
    );

    // 更新用户状态为1（在房间中），并设置当前房间ID
    await connection.execute(
      "UPDATE users SET status = 1, enter_room_id = ? WHERE user_id = ?",
      [tableId, userId]
    );

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

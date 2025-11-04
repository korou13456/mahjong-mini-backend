// routes/mahjong/enterRoom.js
const db = require("../../config/database");
const { leaveRoom, joinRoom } = require("../../utils/roomHelpers");

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

    // 1. 如果用户当前在房间中，先退出当前房间（退出逻辑统一）
    if (currentTableId) {
      await leaveRoom(connection, currentTableId, userId);
    }

    // 2. 加入目标房间
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

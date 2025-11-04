// routes/mahjong/exitRoom.js
const db = require("../../config/database");
const { leaveRoom } = require("../../utils/roomHelpers");

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

    const result = await leaveRoom(connection, tableId, userId);

    if (result.reason === "TABLE_NOT_FOUND") {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "桌子不存在",
      });
    }

    if (result.reason === "NOT_IN_ROOM") {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "您不在该房间中",
      });
    }

    await connection.commit();

    res.json({
      success: true,
      message: "成功退出房间",
      data: {
        tableId,
        userId,
        currentPlayers: (result.participants || []).length,
        newHostId: result.newHostId,
        newStatus: result.newStatus,
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

// routes/mahjong/getUserRoomStatus.js
const db = require("../../config/database");

const getUserRoomStatus = async (req, res) => {
  try {
    const userId = req.user.userId;

    if (!userId) {
      return res.status(400).json({
        code: 400,
        message: "用户ID不能为空",
      });
    }

    // 1. 查询用户基本信息（只查询必要的字段）
    const [userResults] = await db.execute(
      "SELECT status, enter_room_id FROM users WHERE user_id = ?",
      [userId]
    );

    if (userResults.length === 0) {
      return res.status(404).json({
        code: 404,
        message: "用户不存在",
      });
    }

    const user = userResults[0];

    // 2. 如果用户状态为0（闲置），直接返回
    if (user.status === 0) {
      return res.json({
        code: 200,
        message: "success",
        data: {
          isInRoom: false,
        },
      });
    }

    // 3. 如果用户状态不为0，检查房间状态
    if (!user.enter_room_id) {
      // 如果enter_room_id为空但status不为0，更新用户状态
      await db.execute("UPDATE users SET status = 0 WHERE user_id = ?", [
        userId,
      ]);

      return res.json({
        code: 200,
        message: "success",
        data: {
          isInRoom: false,
        },
      });
    }

    // 4. 查询房间信息（只查询必要的字段）
    const [roomResults] = await db.execute(
      `SELECT 
        status,
        TIMESTAMPDIFF(HOUR, create_time, NOW()) as hours_since_creation
       FROM table_list 
       WHERE id = ?`,
      [user.enter_room_id]
    );

    if (roomResults.length === 0) {
      // 房间不存在，更新用户状态
      await db.execute(
        "UPDATE users SET status = 0, enter_room_id = NULL WHERE user_id = ?",
        [userId]
      );

      return res.json({
        code: 200,
        message: "success",
        data: {
          isInRoom: false,
        },
      });
    }

    const room = roomResults[0];

    // 5. 检查房间是否作废的条件
    const isRoomExpired =
      room.status === 2 || // 已结束
      room.status === 3 || // 已取消
      room.hours_since_creation >= 2; // 创建超过2小时

    if (isRoomExpired) {
      // 房间已作废，更新用户状态
      await db.execute(
        "UPDATE users SET status = 0, enter_room_id = NULL WHERE user_id = ?",
        [userId]
      );

      return res.json({
        code: 200,
        message: "success",
        data: {
          isInRoom: false,
        },
      });
    }

    // 6. 房间有效，返回房间信息
    return res.json({
      code: 200,
      message: "success",
      data: {
        isInRoom: true,
        enter_room_id: user.enter_room_id,
      },
    });
  } catch (error) {
    console.error("获取用户房间状态失败:", error);
    res.status(500).json({
      code: 500,
      message: "获取用户房间状态失败",
      error: error.message,
    });
  }
};

module.exports = getUserRoomStatus;

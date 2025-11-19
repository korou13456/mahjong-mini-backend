// routes/mahjong/createRoom.js
const db = require("../../config/database");
const { leaveRoom } = require("../../utils/roomHelpers");

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

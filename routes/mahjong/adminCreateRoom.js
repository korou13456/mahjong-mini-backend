// routes/mahjong/adminCreateRoom.js
const db = require("../../config/database");

const adminCreateRoom = async (req, res) => {
  const connection = await db.getConnection();
  console.log(12312312);
  try {
    await connection.beginTransaction();

    const {
      pay_type = 0,
      scoring_tier = 0,
      special_notes = "",
      start_time,
      store_id,
      duration = 0,
      mahjong_type = 0,
      gender_pref = 0,
      participants, // [1,2,3]
      smoking_pref = 1,
      req_num = 4,
    } = req.body;

    // 基础校验
    if (!start_time || !store_id) {
      return res.status(400).json({
        code: 400,
        success: false,
        message: "缺少必要参数：start_time、store_id",
      });
    }

    // participants 必须是数组并至少有一个用户
    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({
        code: 400,
        success: false,
        message: "participants 必须为非空数组，例如 [1,2,3]",
      });
    }

    // 取第一个为房主
    const host_id = participants[0];

    // 创建房间
    const [result] = await connection.execute(
      `INSERT INTO table_list 
       (host_id, pay_type, scoring_tier, special_notes, start_time, store_id, duration, mahjong_type, gender_pref, smoking_pref, req_num, participants) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        host_id,
        pay_type,
        scoring_tier,
        special_notes,
        start_time,
        store_id,
        duration,
        mahjong_type,
        gender_pref,
        smoking_pref,
        req_num,
        JSON.stringify(participants),
      ]
    );

    const roomId = result.insertId;

    // 批量更新所有参与者状态
    const updatePromises = participants.map((uid) =>
      connection.execute(
        "UPDATE users SET status = 1, enter_room_id = ? WHERE user_id = ?",
        [roomId, uid]
      )
    );

    await Promise.all(updatePromises);

    await connection.commit();

    res.json({
      code: 200,
      success: true,
      message: "管理员创建房间成功",
      data: {
        room_id: roomId,
        host_id,
        participants,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("管理员创建房间错误:", error);
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

module.exports = adminCreateRoom;

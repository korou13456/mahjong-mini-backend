const db = require("../../config/database");

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
      const [tables] = await connection.execute(
        "SELECT participants, status, host_id FROM `table_list` WHERE id = ?",
        [currentTableId]
      );

      if (tables.length > 0) {
        const table = tables[0];
        let participants = [];

        if (table.participants) {
          participants =
            typeof table.participants === "string"
              ? JSON.parse(table.participants)
              : table.participants;
        }

        const userIndex = participants.indexOf(parseInt(host_id));
        if (userIndex !== -1) {
          participants.splice(userIndex, 1);

          // 如果退出的是房主，换成下一个或者保留最后退出者id
          let newHostId = table.host_id;
          if (table.host_id === parseInt(host_id)) {
            if (participants.length > 0) {
              newHostId = participants[0];
            } else {
              newHostId = parseInt(host_id);
            }
          }

          // 房间没人时，状态变为3
          const newStatus = participants.length === 0 ? 3 : table.status;

          // 更新退出房间的参与者列表、host_id和状态
          await connection.execute(
            "UPDATE `table_list` SET participants = ?, host_id = ?, status = ? WHERE id = ?",
            [JSON.stringify(participants), newHostId, newStatus, currentTableId]
          );

          // 更新用户状态为0，清空enter_room_id
          await connection.execute(
            "UPDATE users SET status = 0, enter_room_id = NULL WHERE user_id = ?",
            [host_id]
          );
        }
      }
    }

    // 创建新房间
    const [result] = await connection.execute(
      `INSERT INTO table_list 
       (host_id, pay_type, scoring_tier, special_notes, start_time, store_id, duration, mahjong_type, gender_pref, participants) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

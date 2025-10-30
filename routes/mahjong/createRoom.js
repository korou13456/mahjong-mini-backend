const db = require("../../config/database");

// 创建房间接口
const createRoom = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      host_id,
      pay_type,
      scoring_tier,
      special_notes,
      start_time,
      store_id,
      duration,
      mahjong_type,
      gender_pref = 0,
    } = req.body;

    // 参数验证
    if (!host_id || !start_time || !store_id) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数：host_id、start_time、store_id",
      });
    }

    // 插入房间数据
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
        JSON.stringify([host_id]), // 初始为空数组
      ]
    );

    // 更新用户状态为在房间中
    await connection.execute("UPDATE users SET status = 1 WHERE user_id = ?", [
      host_id,
    ]);

    await connection.commit();

    res.json({
      success: true,
      message: "房间创建成功",
    });
  } catch (error) {
    await connection.rollback();
    console.error("创建房间错误:", error);
    res.status(500).json({
      success: false,
      message: "创建房间失败",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

module.exports = createRoom;

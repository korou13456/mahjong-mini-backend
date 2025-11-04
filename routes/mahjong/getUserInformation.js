const db = require("../../config/database");

const getUserInformation = async (req, res) => {
  const connection = await db.getConnection();

  try {
    // 从 authMiddleware 中拿到用户ID
    const userId = req.user.userId;

    if (!userId) {
      return res.status(401).json({ code: 401, message: "未登录" });
    }

    const [rows] = await connection.execute(
      "SELECT id, user_id, nickname, avatar_url, gender, phone_num, total_game_cnt, total_game_create FROM users WHERE user_id = ?",
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ code: 404, message: "用户不存在" });
    }

    const user = rows[0];

    res.json({
      code: 200,
      message: "获取用户信息成功",
      data: {
        id: user.id,
        userId: user.user_id,
        nickname: user.nickname,
        avatarUrl: user.avatar_url,
        gender: user.gender,
        phoneNum: user.phone_num,
        totalGameCnt: user.total_game_cnt,
        totalGameCreate: user.total_game_create,
      },
    });
  } catch (error) {
    console.error("获取用户信息失败:", error);
    res.status(500).json({ code: 500, message: "服务器错误" });
  } finally {
    connection.release();
  }
};

module.exports = getUserInformation;

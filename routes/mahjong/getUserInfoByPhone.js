// routes/mahjong/getUserInfoByPhone.js
const db = require("../../config/database");

const getUserInfoByPhone = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const { phoneNum } = req.query;

    if (!phoneNum) {
      return res.status(400).json({ code: 400, message: "缺少手机号参数" });
    }

    const [rows] = await connection.execute(
      `SELECT 
         id, user_id, nickname, avatar_url, gender, phone_num, 
         total_game_cnt, total_game_create, location, is_subscribed 
       FROM users 
       WHERE phone_num = ?`,
      [phoneNum]
    );

    // 不再返回 404，直接返回空数组
    const users = rows.map((user) => ({
      id: user.id,
      userId: user.user_id,
      nickname: user.nickname,
      avatarUrl: user.avatar_url,
      gender: user.gender,
      phoneNum: user.phone_num,
      totalGameCnt: user.total_game_cnt,
      totalGameCreate: user.total_game_create,
      location: user.location,
      isSubscribed: user.is_subscribed,
    }));

    res.json({
      code: 200,
      message: "获取用户信息成功",
      data: users,
    });
  } catch (error) {
    console.error("根据手机号获取用户信息失败:", error);
    res.status(500).json({ code: 500, message: "服务器错误" });
  } finally {
    connection.release();
  }
};

module.exports = getUserInfoByPhone;

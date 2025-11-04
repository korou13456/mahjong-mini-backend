// routes/mahjong/index.js
const db = require("../../config/database");
const axios = require("axios");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

// JWT secret（已从环境变量读取）
const JWT_SECRET = process.env.JWT_SECRET || "change_me_in_env";

const wechatLogin = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { code, encryptedData, iv } = req.body;

    if (!code) {
      return res.status(400).json({ code: 400, message: "缺少登录凭证code" });
    }

    const appid = process.env.WECHAT_APPID;
    const secret = process.env.WECHAT_SECRET;

    const wechatResponse = await axios.get(
      "https://api.weixin.qq.com/sns/jscode2session",
      {
        params: {
          appid,
          secret,
          js_code: code,
          grant_type: "authorization_code",
        },
      }
    );

    const { openid, session_key, errcode, errmsg } = wechatResponse.data;

    if (errcode) {
      return res
        .status(400)
        .json({ code: 400, message: `微信登录失败: ${errmsg}` });
    }

    if (!openid) {
      return res.status(400).json({ code: 400, message: "获取openid失败" });
    }

    // 解密手机号函数
    function decryptData(sessionKey, encryptedData, iv) {
      const sessionKeyBuf = Buffer.from(sessionKey, "base64");
      const encryptedDataBuf = Buffer.from(encryptedData, "base64");
      const ivBuf = Buffer.from(iv, "base64");

      try {
        const decipher = crypto.createDecipheriv(
          "aes-128-cbc",
          sessionKeyBuf,
          ivBuf
        );
        decipher.setAutoPadding(true);
        let decoded = decipher.update(encryptedDataBuf, null, "utf8");
        decoded += decipher.final("utf8");
        return JSON.parse(decoded);
      } catch (err) {
        throw new Error("解密失败");
      }
    }

    let phoneNumber = null;
    if (encryptedData && iv) {
      const phoneInfo = decryptData(session_key, encryptedData, iv);
      phoneNumber = phoneInfo.phoneNumber;
    }

    // 查询是否已有该微信用户
    const [existingUsers] = await connection.execute(
      "SELECT id, user_id, nickname, avatar_url, gender, phone_num, total_game_cnt, total_game_create FROM users WHERE wxid = ?",
      [openid]
    );

    let user;
    let isNewUser = false;

    if (existingUsers.length > 0) {
      user = existingUsers[0];
      if (!user.phone_num && phoneNumber) {
        await connection.execute(
          "UPDATE users SET phone_num = ?, last_login_at = NOW() WHERE id = ?",
          [phoneNumber, user.id]
        );
        user.phone_num = phoneNumber;
      } else {
        await connection.execute(
          "UPDATE users SET last_login_at = NOW() WHERE id = ?",
          [user.id]
        );
      }
    } else {
      isNewUser = true;
      const userId = await generateUserId(connection);
      const nickname = `用户${userId}`;
      const avatarUrl = "";
      const gender = 0;

      const [insertResult] = await connection.execute(
        `INSERT INTO users (user_id, wxid, nickname, avatar_url, gender, phone_num, last_login_at, status, total_game_cnt, total_game_create)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), 0, 0, 0)`,
        [userId, openid, nickname, avatarUrl, gender, phoneNumber]
      );

      user = {
        id: insertResult.insertId,
        user_id: userId,
        nickname,
        avatar_url: avatarUrl,
        gender,
        phone_num: phoneNumber,
        total_game_cnt: 0,
        total_game_create: 0,
      };
    }

    // 生成JWT Token，有效期7天，可根据需求调整
    const token = jwt.sign(
      {
        userId: user.user_id,
        wxid: openid,
        id: user.id,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    await connection.commit();

    return res.json({
      code: 200,
      message: "登录成功",
      data: {
        token,
        userInfo: {
          id: user.id,
          userId: user.user_id,
          nickname: user.nickname,
          avatarUrl: user.avatar_url,
          gender: user.gender,
          phoneNum: user.phone_num,
          totalGameCnt: user.total_game_cnt,
          totalGameCreate: user.total_game_create,
        },
        isNewUser,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("微信登录失败:", error);
    return res.status(500).json({
      code: 500,
      message: "登录失败",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

// generateUserId 和之前一样

async function generateUserId(connection) {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString().slice(2, 6);
  const userId = parseInt(timestamp + random);

  const [existing] = await connection.execute(
    "SELECT id FROM users WHERE user_id = ?",
    [userId]
  );

  if (existing.length === 0) {
    return userId;
  }
  return generateUserId(connection);
}

module.exports = wechatLogin;

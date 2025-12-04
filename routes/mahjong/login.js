// routes/mahjong/index.js
const db = require("../../config/database");
const axios = require("axios");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { newUserRegisterReward } = require("./invitePoints");

// JWT secret（已从环境变量读取）
const JWT_SECRET = process.env.JWT_SECRET || "change_me_in_env";

// 生成完整的文件URL
function getFileUrl(filename) {
  const baseUrl = process.env.PUBLIC_BASE_URL; // e.g. https://majhongapp.cn
  if (baseUrl) return `${baseUrl}/uploads/${filename}`;
  const host = process.env.PUBLIC_HOST;
  const port = process.env.PORT || 3000;
  return `http://${host}:${port}/uploads/${filename}`;
}

// 根据gender获取默认头像
function getDefaultAvatarUrl(gender) {
  // gender: 0, 1, 2 对应 gender0.jpg, gender1.jpg, gender2.jpg
  const genderValue = gender || 0;
  const filename = `gender${genderValue}.jpg`;
  return getFileUrl(filename);
}

// 获取客户端真实IP地址
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
         req.headers['x-real-ip'] || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
         (req.connection?.socket ? req.connection.socket.remoteAddress : null) ||
         req.ip ||
         '0.0.0.0';
}

const wechatLogin = async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { code, encryptedData, iv, inviteSource } = req.body;
    const guid = req.headers.guid;
    const clientIP = getClientIP(req);

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

    const { openid, session_key, unionid, errcode, errmsg } =
      wechatResponse.data;

    if (errcode) {
      return res
        .status(400)
        .json({ code: 400, message: `微信登录失败: ${errmsg}` });
    }

    if (!openid) {
      return res.status(400).json({ code: 400, message: "获取openid失败" });
    }

    if (!unionid) {
      return res.status(400).json({ code: 400, message: "获取unionid失败" });
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
      "SELECT id, user_id, nickname, avatar_url, gender, phone_num, total_game_cnt, total_game_create, guid FROM users WHERE wxid = ?",
      [openid]
    );

    let user;
    let isNewUser = false;

    if (existingUsers.length > 0) {
      user = existingUsers[0];

      // 检查是否需要更新guid
      if (guid && !user.guid) {
        await connection.execute(
          "UPDATE users SET guid = ?, last_login_at = NOW(), ip = ? WHERE id = ?",
          [guid, clientIP, user.id]
        );
      } else if (!user.phone_num && phoneNumber) {
        await connection.execute(
          "UPDATE users SET phone_num = ?, last_login_at = NOW(), ip = ? WHERE id = ?",
          [phoneNumber, clientIP, user.id]
        );
        user.phone_num = phoneNumber;
      } else {
        await connection.execute(
          "UPDATE users SET last_login_at = NOW(), ip = ? WHERE id = ?",
          [clientIP, user.id]
        );
      }
    } else {
      // 按 unionid 再次检索：如果有对应用户，则将当前小程序 openid 绑定到该记录并完善必要字段
      const [unionUsers] = await connection.execute(
        "SELECT id, user_id, nickname, avatar_url, gender, phone_num, guid FROM users WHERE unionid = ? LIMIT 1",
        [unionid]
      );
      if (unionUsers.length > 0) {
        const existed = unionUsers[0];
        let assignedUserId = existed.user_id;
        const updates = [];
        const params = [];

        // 始终绑定 wxid 并更新时间
        updates.push("wxid = ?");
        params.push(openid);
        updates.push("last_login_at = NOW()");
        updates.push("ip = ?");
        params.push(clientIP);

        // 如果有guid且原记录没有，则写入
        if (guid && !existed.guid) {
          updates.push("guid = ?");
          params.push(guid);
        }

        // 如果有手机号且原记录没有，则写入
        if (phoneNumber && !existed.phone_num) {
          updates.push("phone_num = ?");
          params.push(phoneNumber);
        }

        // 该记录可能来自服务号关注，只含 unionid；若无 user_id，则生成并补齐必要基础信息
        if (!assignedUserId) {
          assignedUserId = await generateUserId(connection);
          const fallbackGender = 0;
          const fallbackNickname = `用户${assignedUserId}`;
          const fallbackAvatar = getDefaultAvatarUrl(fallbackGender);
          updates.push("user_id = ?");
          params.push(assignedUserId);
          // 仅在为空时补齐基础信息，避免覆盖已有资料
          updates.push(
            "nickname = COALESCE(NULLIF(nickname, ''), ?)",
            "avatar_url = COALESCE(NULLIF(avatar_url, ''), ?)",
            "gender = IFNULL(gender, ?)"
          );
          params.push(fallbackNickname, fallbackAvatar, fallbackGender);
          // 确保状态与计数等为默认（不强制覆盖已有）
          updates.push(
            "status = IFNULL(status, 0)",
            "total_game_cnt = IFNULL(total_game_cnt, 0)",
            "total_game_create = IFNULL(total_game_create, 0)"
          );
        }

        params.push(existed.id);
        const sql = `UPDATE users SET ${updates.join(", ")} WHERE id = ?`;
        await connection.execute(sql, params);

        user = {
          id: existed.id,
          user_id: assignedUserId || existed.user_id,
        };
        isNewUser = false;
      } else {
        // 既无 wxid 也无 unionid 的记录，才执行插入
        isNewUser = true;
        const userId = await generateUserId(connection);
        const nickname = `用户${userId}`;
        const gender = 0;
        // 根据gender设置默认头像URL
        const avatarUrl = getDefaultAvatarUrl(gender);
        const [insertResult] = await connection.execute(
          `INSERT INTO users (user_id, wxid, nickname, avatar_url, gender, phone_num, unionid, last_login_at, ip, status, total_game_cnt, total_game_create, source, guid)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?, 0, 0, 0, ?, ?)`,
          [
            userId,
            openid,
            nickname,
            avatarUrl,
            gender,
            phoneNumber,
            unionid,
            clientIP,
            inviteSource || null,
            guid || null,
          ]
        );
        newUserRegisterReward(connection, userId, guid, inviteSource);

        user = {
          id: insertResult.insertId,
          user_id: userId,
        };
      }
    }

    // 生成JWT Token，有效期7天，可根据需求调整
    const token = jwt.sign(
      {
        userId: user.user_id,
        unionid: unionid,
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

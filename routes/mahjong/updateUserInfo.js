const db = require("../../config/database");
const fs = require("fs");
const path = require("path");

// 生成完整的文件URL
function getFileUrl(filename) {
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

const updateUserInfo = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const user_id = req.user && req.user.userId;
    if (!user_id) {
      return res.status(401).json({ message: "未认证或无效的用户" });
    }

    const {
      nickname,
      avatar_url,
      gender,
      province,
      city,
      district,
      if_change_avatar,
    } = req.body;

    const updates = [];
    const params = [];

    // 开启事务
    await connection.beginTransaction();

    // 如果有新头像，先查旧头像路径
    let oldAvatarUrl = null;
    if (avatar_url !== undefined) {
      const [rows] = await connection.execute(
        "SELECT avatar_url FROM users WHERE user_id = ?",
        [user_id]
      );
      if (rows.length > 0) {
        oldAvatarUrl = rows[0].avatar_url;
      }
    }

    if (nickname !== undefined) {
      updates.push("nickname = ?");
      params.push(nickname);
    }
    if (avatar_url !== undefined) {
      updates.push("avatar_url = ?");
      params.push(avatar_url);
    }
    if (gender !== undefined) {
      if (![1, 2].includes(Number(gender))) {
        await connection.rollback();
        return res.status(400).json({ message: "gender 参数不合法" });
      }
      if (if_change_avatar) {
        const avatar_url = getDefaultAvatarUrl(gender);
        updates.push("avatar_url = ?");
        params.push(avatar_url);
      }
      updates.push("gender = ?");
      params.push(gender);
    }

    if (
      province !== undefined &&
      city !== undefined &&
      district !== undefined
    ) {
      updates.push("province = ?", "city = ?", "district = ?", "location = ?");
      const location = province + city + district;
      params.push(province, city, district, location);
    }

    if (updates.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: "没有要更新的字段" });
    }

    params.push(user_id);

    const [result] = await connection.execute(
      `UPDATE users SET ${updates.join(", ")} WHERE user_id = ?`,
      params
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "用户不存在或未更新" });
    }

    // 删除旧头像文件（本地文件且路径非空）
    if (oldAvatarUrl && avatar_url && oldAvatarUrl !== avatar_url) {
      try {
        // 假设你的头像 URL 是类似 http://host/uploads/filename.jpg
        // 这里提取文件名，拼接成服务器文件绝对路径
        const urlObj = new URL(oldAvatarUrl);
        const filename = path.basename(urlObj.pathname);

        // 如果是默认头像文件（gender0.jpg, gender1.jpg, gender2.jpg），则不删除
        if (
          filename === "gender0.jpg" ||
          filename === "gender1.jpg" ||
          filename === "gender2.jpg"
        ) {
          console.log(`跳过删除默认头像文件: ${filename}`);
        } else {
          const filePath = path.join(process.cwd(), urlObj.pathname);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`删除旧头像文件成功: ${filePath}`);
          }
        }
      } catch (err) {
        console.warn("删除旧头像文件失败:", err.message);
        // 这里不影响主流程，不回滚
      }
    }

    await connection.commit();

    res.json({ message: "用户信息更新成功" });
  } catch (error) {
    await connection.rollback();
    console.error("更新用户信息错误:", error);
    res.status(500).json({ message: "服务器内部错误" });
  } finally {
    connection.release();
  }
};

module.exports = updateUserInfo;

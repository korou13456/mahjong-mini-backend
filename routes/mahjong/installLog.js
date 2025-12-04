// routes/mahjong/installLog.js
const db = require("../../config/database");
const { extractUserIdFromToken } = require("../../utils/tokenHelpers");

// 记录小程序安装信息
const recordInstall = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    const guid = req.headers.guid;

    const { install_version, current_version, device_model, platform } =
      req.body;
    const user_id = extractUserIdFromToken(req);

    console.log(user_id, "user_id");
    // 参数验证 - user_id为可选
    if (
      !guid ||
      !install_version ||
      !current_version ||
      !device_model ||
      !platform
    ) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message:
          "缺少必要参数：guid, install_version, current_version, device_model",
      });
    }

    // 检查是否已存在该guid的记录
    const [existingRecords] = await connection.execute(
      `SELECT id, user_id, install_version, current_version FROM install_logs WHERE guid = ?`,
      [guid]
    );

    let result;

    if (existingRecords && existingRecords.length > 0) {
      // 更新现有记录
      await connection.execute(
        `UPDATE install_logs SET 
          user_id = ?, 
          current_version = ?, 
          device_model = ?,
          platform = ?
        WHERE guid = ?`,
        [user_id || null, current_version, device_model, platform, guid]
      );

      result = {
        isUpdate: true,
        previousRecord: existingRecords[0],
      };
    } else {
      // 插入新记录
      const [insertResult] = await connection.execute(
        `INSERT INTO install_logs 
          (guid, install_version, current_version, device_model,platform, user_id) 
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          guid,
          install_version,
          current_version,
          device_model,
          platform,
          user_id || null,
        ]
      );

      result = {
        isUpdate: false,
        insertId: insertResult.insertId,
      };
    }

    await connection.commit();

    res.json({
      success: true,
      message: result.isUpdate ? "安装记录更新成功" : "安装记录创建成功",
      data: {
        guid,
        user_id: user_id || null,
        install_version,
        current_version,
        device_model,
        ...result,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error("记录安装信息失败:", error);
    res.status(500).json({
      success: false,
      message: "服务器内部错误",
    });
  } finally {
    connection.release();
  }
};

module.exports = {
  recordInstall,
};

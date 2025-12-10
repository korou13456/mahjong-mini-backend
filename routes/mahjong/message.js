const db = require("../../config/database");
const { extractUserIdFromToken } = require("../../utils/tokenHelpers");

// 用户发送评论记录到数据库
async function sendMessage(req, res) {
  const connection = await db.getConnection();

  try {
    const { table_id, text } = req.body;
    const userId = extractUserIdFromToken(req);

    // 参数验证
    if (!table_id) {
      return res.status(400).json({
        success: false,
        message: "桌局ID不能为空",
      });
    }

    if (!text || text.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "消息内容不能为空",
      });
    }

    if (text.length > 500) {
      return res.status(400).json({
        success: false,
        message: "消息内容不能超过500个字符",
      });
    }

    // 验证桌局是否存在
    const [tableExists] = await connection.execute(
      "SELECT id FROM table_list WHERE id = ?",
      [table_id]
    );

    if (tableExists.length === 0) {
      return res.status(404).json({
        success: false,
        message: "桌局不存在",
      });
    }

    // 插入消息记录
    const [result] = await connection.execute(
      "INSERT INTO message_log (table_id, user_id, text) VALUES (?, ?, ?)",
      [table_id, userId, text.trim()]
    );

    // 格式化时间
    const now = new Date();
    const formattedTime = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(
      now.getHours()
    ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(
      now.getSeconds()
    ).padStart(2, "0")}`;

    connection.release();

    res.json({
      success: true,
      message: "消息发送成功",
      data: {
        id: result.insertId,
        table_id,
        user_id: userId,
        text: text.trim(),
        create_time: formattedTime,
      },
    });
  } catch (error) {
    connection.release();
    console.error("发送消息失败:", error);
    res.status(500).json({
      success: false,
      message: "发送消息失败",
      error: error.message,
    });
  }
}

// 根据table_id查找对应桌局的消息
async function getMessages(req, res) {
  const connection = await db.getConnection();

  try {
    const { table_id } = req.query;
    const userId = extractUserIdFromToken(req);

    // 参数验证
    if (!table_id) {
      return res.status(400).json({
        success: false,
        message: "桌局ID不能为空",
      });
    }

    // 验证桌局是否存在
    const [tableExists] = await connection.execute(
      "SELECT id FROM table_list WHERE id = ?",
      [table_id]
    );

    if (tableExists.length === 0) {
      return res.status(404).json({
        success: false,
        message: "桌局不存在",
      });
    }

    // 查询消息记录（按时间倒序）
    const [messages] = await connection.execute(
      `SELECT 
        ml.id,
        ml.table_id,
        ml.user_id,
        ml.text,
        ml.create_time,
        u.nickname,
        u.avatar_url
      FROM message_log ml
      LEFT JOIN users u ON ml.user_id = u.user_id
      WHERE ml.table_id = ?
      ORDER BY ml.create_time DESC
      LIMIT 100`,
      [table_id]
    );

    connection.release();

    // 格式化时间函数
    const formatDateTime = (dateString) => {
      if (!dateString) return "";
      const date = new Date(dateString);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    };

    res.json({
      success: true,
      message: "获取消息成功",
      data: messages.map((msg) => ({
        id: msg.id,
        user_id: msg.user_id,
        text: msg.text,
        create_time: formatDateTime(msg.create_time), // 格式化后的时间
        is_me: msg.user_id === userId, // 是否为当前用户发送的消息
        sender_info: {
          nickname: msg.nickname || "未知用户",
          avatar_url: msg.avatar_url || "",
        },
      })),
    });
  } catch (error) {
    connection.release();
    console.error("获取消息失败:", error);
    res.status(500).json({
      success: false,
      message: "获取消息失败",
      error: error.message,
    });
  }
}

// 删除消息接口
async function deleteMessage(req, res) {
  const connection = await db.getConnection();

  try {
    const { message_id } = req.body;
    const userId = extractUserIdFromToken(req);

    // 参数验证
    if (!message_id) {
      return res.status(400).json({
        success: false,
        message: "消息ID不能为空",
      });
    }

    // 查询消息是否存在以及是否为发送者本人
    const [messageExists] = await connection.execute(
      "SELECT user_id, table_id FROM message_log WHERE id = ?",
      [message_id]
    );

    if (messageExists.length === 0) {
      return res.status(404).json({
        success: false,
        message: "消息不存在",
      });
    }

    // 检查是否为消息发送者本人
    if (messageExists[0].user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: "只能删除自己发送的消息",
      });
    }

    // 删除消息
    const [result] = await connection.execute(
      "DELETE FROM message_log WHERE id = ? AND user_id = ?",
      [message_id, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "删除失败，消息不存在或无权限删除",
      });
    }

    connection.release();

    res.json({
      success: true,
      message: "消息删除成功",
      data: {
        message_id,
        deleted: true,
      },
    });
  } catch (error) {
    connection.release();
    console.error("删除消息失败:", error);
    res.status(500).json({
      success: false,
      message: "删除消息失败",
      error: error.message,
    });
  }
}

module.exports = {
  sendMessage,
  getMessages,
  deleteMessage,
};

// routes/mahjong/eventLog.js
const db = require("../../config/database");

function parseUA(ua) {
  const result = {};

  // 设备和系统
  const deviceMatch = ua.match(/\(([^)]+)\)/);
  if (deviceMatch) {
    const parts = deviceMatch[1].split(";").map((s) => s.trim());
    result.device = parts[0]; // iPhone
    const os = parts.find((p) => p.includes("CPU iPhone OS"));
    if (os) {
      result.os = os.replace("CPU iPhone OS ", "").replace(/_/g, "."); // 15.0
    }
  }

  return result["device"] + " " + result["os"];
}

// 记录事件日志接口
const eventLog = async (req, res) => {
  const connection = await db.getConnection();

  try {
    const {
      event_name,
      event_location,
      event_time,
      user_id,
      guid,
      extra,
      city,
    } = req.body;

    // 从header获取版本信息
    const current_version = req.headers["x-app-version"];
    const initial_version = req.headers["x-initial-version"];

    // 参数验证
    if (!event_name || !event_location) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数：event_name||event_location",
      });
    }

    if (!event_time) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数：event_time",
      });
    }

    if (!guid) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数：guid",
      });
    }

    // 获取客户端IP（自动获取，不允许前端传递）
    let clientIp =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      (req.connection?.socket ? req.connection.socket.remoteAddress : null) ||
      req.ip ||
      "unknown";

    // 处理IPv6地址转换为IPv4格式
    if (clientIp === "::1" || clientIp === "::ffff:127.0.0.1") {
      clientIp = "127.0.0.1";
    } else if (clientIp.startsWith("::ffff:")) {
      clientIp = clientIp.substring(7); // 移除::ffff:前缀
    }

    // 获取User-Agent（自动解析UA头）
    const userAgent = req.headers["user-agent"] || "unknown";

    // 处理extra字段
    let extraData = null;
    if (extra) {
      try {
        // 如果extra是字符串，尝试解析为JSON
        if (typeof extra === "string") {
          extraData = JSON.parse(extra);
        } else {
          extraData = extra;
        }
      } catch (e) {
        console.warn("解析extra字段失败:", e.message);
        extraData = { raw: extra }; // 解析失败时保存原始数据
      }
    }

    // 插入事件日志
    const insertSql = `
      INSERT INTO event_log (
        event_name, 
        event_location,
        event_time, 
        user_id, 
        guid, 
        extra, 
        initial_version, 
        current_version, 
        city, 
        platform, 
        ip
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    console.log(userAgent, "!======>>>userAgent");
    const [result] = await connection.execute(insertSql, [
      event_name,
      event_location,
      event_time,
      user_id || null,
      guid,
      extraData ? JSON.stringify(extraData) : null,
      initial_version || null,
      current_version || null,
      city || null,
      parseUA(userAgent),
      clientIp,
    ]);

    res.json({
      success: true,
      message: "事件日志记录成功",
    });
  } catch (error) {
    console.error("记录事件日志失败:", error);
    res.status(500).json({
      success: false,
      message: "记录事件日志失败",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

module.exports = eventLog;

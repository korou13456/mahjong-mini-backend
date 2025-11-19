// routes/mahjong/getUserRoomStatus.js
const jwt = require("jsonwebtoken");
const db = require("../../config/database");
const {
  parseParticipants,
  encodeRoomId,
  fetchUserMap,
  fetchStoreMap,
} = require("../../utils/roomHelpers");
const JWT_SECRET = process.env.JWT_SECRET;

const getTableDetail = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { tableId } = req.query;
    if (!tableId) {
      return res.status(400).json({
        success: false,
        message: "缺少必要参数：tableId",
      });
    }

    let currentUserId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        currentUserId = decoded.userId;
      } catch {
        currentUserId = null;
      }
    }

    // 查询房间基本信息
    const sqlRoom = `
      SELECT 
        id,
        host_id as hostId,
        participants,
        pay_type as payType,
        scoring_tier as scoringTier,
        special_notes as specialNotes,
        start_time as startTime,
        store_id as storeId,
        duration,
        mahjong_type as mahjongType,
        gender_pref as genderPref,
        smoking_pref as smokingPref,
        req_num as reqNum,
        status,
        create_time as createTime,
        update_time as updateTime
      FROM table_list
      WHERE id = ?
      LIMIT 1
    `;
    const [roomRows] = await connection.execute(sqlRoom, [tableId]);
    if (!roomRows.length) {
      return res.status(404).json({
        success: false,
        message: "房间不存在",
      });
    }
    const room = roomRows[0];

    // 解析参与者ID数组
    const participantIds = parseParticipants(room.participants);
    room.participants = participantIds;

    // 查询用户信息（参与者）
    let userMap = {};
    if (participantIds.length > 0)
      userMap = await fetchUserMap(connection, participantIds);

    // 把参与者换成用户详细信息数组，并标记 isMe
    room.participants = participantIds
      .map((id) => {
        const user = userMap[id];
        if (!user) return null;
        return {
          ...user,
          ...(currentUserId && id === currentUserId ? { isMe: true } : {}),
        };
      })
      .filter(Boolean);

    // 查询店铺信息
    let storeInfo = null;
    if (room.storeId) {
      const storeMap = await fetchStoreMap(connection, [room.storeId]);
      storeInfo = storeMap[room.storeId] || null;
    }

    const showId = encodeRoomId(room.id);
    
    // 判断当前用户是否在房间中
    const isCurrentRoom = currentUserId && participantIds.includes(currentUserId);

    // 返回结果
    res.json({
      success: true,
      data: {
        ...room,
        storeInfo,
        showId,
        isCurrentRoom,
      },
    });
  } catch (error) {
    console.error("获取房间详情失败:", error);
    res.status(500).json({
      success: false,
      message: "获取房间详情失败",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

module.exports = getTableDetail;

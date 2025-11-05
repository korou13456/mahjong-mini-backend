const jwt = require("jsonwebtoken");
const db = require("../../config/database");
const { parseParticipants } = require("../../utils/roomHelpers");
const JWT_SECRET = process.env.JWT_SECRET;

const extractUserIds = (participants) => {
  return participants
    .map((id) => Number(id))
    .filter((id) => !isNaN(id) && id > 0);
};

const getTableList = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // ✅ 尝试解析 token（非强制）
    let currentUserId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        currentUserId = decoded.userId;
      } catch {
        console.warn("Token无效或已过期，但不影响查询");
      }
    }

    // ✅ 查找过期房间并更新状态
    const findExpiredSql = `
      SELECT id, participants 
      FROM table_list 
      WHERE status = 0 
        AND (start_time < NOW() OR TIMESTAMPDIFF(HOUR, create_time, NOW()) > 2)
    `;
    const [expiredRooms] = await connection.execute(findExpiredSql);

    if (expiredRooms.length > 0) {
      const expiredRoomIds = expiredRooms.map((r) => r.id);
      const placeholders = expiredRoomIds.map(() => "?").join(",");
      await connection.execute(
        `UPDATE table_list SET status = 3 WHERE id IN (${placeholders})`,
        expiredRoomIds
      );

      const allUserIds = [];
      expiredRooms.forEach((r) => {
        const participants = parseParticipants(r.participants);
        allUserIds.push(...extractUserIds(participants));
      });

      if (allUserIds.length > 0) {
        const uniqueUserIds = [...new Set(allUserIds)];
        const userPlaceholders = uniqueUserIds.map(() => "?").join(",");
        await connection.execute(
          `UPDATE users SET status = 0, enter_room_id = NULL WHERE user_id IN (${userPlaceholders})`,
          uniqueUserIds
        );
      }
    }

    // ✅ 查询活跃房间列表
    const selectSql = `
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
        status,
        create_time as createTime
      FROM table_list 
      WHERE status = 0 
        AND TIMESTAMPDIFF(HOUR, create_time, NOW()) <= 2
        AND start_time >= NOW()
      ORDER BY create_time DESC
    `;
    const [results] = await connection.execute(selectSql);

    // ✅ 收集所有用户ID 和 store_id
    const userIds = new Set();
    const storeIds = new Set();
    const parsedParticipantsMap = new Map();

    results.forEach((row, index) => {
      const participants = parseParticipants(row.participants);
      const validUserIds = extractUserIds(participants);
      parsedParticipantsMap.set(index, validUserIds);
      validUserIds.forEach((id) => userIds.add(id));
      if (row.storeId) storeIds.add(row.storeId);
    });

    // ✅ 批量查询用户信息
    const userMap = {};
    if (userIds.size > 0) {
      const userIdArray = Array.from(userIds);
      const placeholders = userIdArray.map(() => "?").join(",");
      const userSql = `
        SELECT 
          id,
          user_id as userId,
          wxid,
          nickname,
          avatar_url as avatarUrl,
          gender,
          phone_num as phoneNum
        FROM users
        WHERE user_id IN (${placeholders})
      `;
      const [userResults] = await connection.execute(userSql, userIdArray);
      userResults.forEach((u) => (userMap[u.userId] = u));
    }

    // ✅ 批量查询门店信息
    const storeMap = {};
    if (storeIds.size > 0) {
      const storeIdArray = Array.from(storeIds);
      const placeholders = storeIdArray.map(() => "?").join(",");
      const storeSql = `
        SELECT 
          id as storeId,
          store_name as storeName,
          store_image as storeImage,
          address_detail as addressDetail,
          province,
          city,
          district,
          latitude,
          longitude,
          manager_name as managerName,
          manager_phone as managerPhone,
          service_wxid as serviceWxid,
          status as storeStatus
        FROM stores
        WHERE id IN (${placeholders})
      `;
      const [storeResults] = await connection.execute(storeSql, storeIdArray);
      storeResults.forEach((s) => (storeMap[s.storeId] = s));
    }

    // ✅ 组装返回数据
    const processedResults = results.map((row, index) => {
      const userIds = parsedParticipantsMap.get(index) || [];
      const isCurrentRoom = currentUserId
        ? userIds.includes(currentUserId)
        : false;

      row.participants = userIds
        .map((uid) => {
          const user = userMap[uid];
          if (!user) return null;
          return {
            ...user,
            ...(currentUserId && uid === currentUserId ? { isMe: true } : {}),
          };
        })
        .filter(Boolean);

      row.isCurrentRoom = isCurrentRoom;
      row.storeInfo = storeMap[row.storeId] || null;

      return row;
    });

    await connection.commit();

    res.json({
      code: 200,
      message: "success",
      list: processedResults,
    });
  } catch (error) {
    await connection.rollback();
    console.error("获取房间列表失败:", error);
    res.status(500).json({
      code: 500,
      message: "获取房间列表失败",
      error: error.message,
    });
  } finally {
    connection.release();
  }
};

module.exports = getTableList;

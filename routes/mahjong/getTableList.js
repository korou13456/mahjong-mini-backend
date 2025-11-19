const jwt = require("jsonwebtoken");
const db = require("../../config/database");
const {
  parseParticipants,
  fetchUserMap,
  fetchStoreMap,
  encodeRoomId,
} = require("../../utils/roomHelpers");
const JWT_SECRET = process.env.JWT_SECRET;

// 提取有效用户ID（number 且 > 0）
const extractUserIds = (participants) => {
  return participants
    .map((id) => Number(id))
    .filter((id) => !isNaN(id) && id > 0);
};

const getTableList = async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 解析 token，获取当前用户ID（非强制）
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

    // 更新过期房间状态
    const findExpiredSql = `
      SELECT id, participants
      FROM table_list 
      WHERE status = 0 
        AND (start_time < NOW() OR TIMESTAMPDIFF(MINUTE, create_time, NOW()) > 120)
    `;
    const [expiredRooms] = await connection.execute(findExpiredSql);

    if (expiredRooms.length > 0) {
      const expiredRoomIds = expiredRooms.map((r) => r.id);
      const placeholders = expiredRoomIds.map(() => "?").join(",");
      await connection.execute(
        `UPDATE table_list SET status = 2 WHERE id IN (${placeholders})`,
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

    // 查询活跃房间列表
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
        smoking_pref as smokingPref,
        req_num as reqNum,
        status,
        create_time as createTime
      FROM table_list 
      WHERE status = 0
        AND TIMESTAMPDIFF(HOUR, create_time, NOW()) <= 2
        AND start_time >= NOW()
      ORDER BY create_time ASC
    `;
    const [results] = await connection.execute(selectSql);

    // 收集所有用户ID 和 store_id
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

    // 查询用户信息
    let userMap = {};
    if (userIds.size > 0) {
      userMap = await fetchUserMap(connection, Array.from(userIds));
    }

    // 查询门店信息
    let storeMap = {};
    if (storeIds.size > 0) {
      storeMap = await fetchStoreMap(connection, Array.from(storeIds));
    }

    // 组装活跃房间列表
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
      row.showId = encodeRoomId(row.id); // ✅ 新增混淆ID

      return row;
    });

    // === 新增逻辑：处理当前用户成局(game_sessions)数据 ===
    let gameList = [];
    if (currentUserId) {
      // 1. 更新过期成局（30分钟以上）状态为 1
      await connection.execute(
        `UPDATE game_sessions
         SET status = 1
         WHERE user_id = ?
           AND status = 0
           AND TIMESTAMPDIFF(MINUTE, create_time, NOW()) > 30`,
        [currentUserId]
      );

      // 2. 查询未过期成局（30分钟以内）
      const [validSessions] = await connection.execute(
        `SELECT id, table_id, create_time
         FROM game_sessions
         WHERE user_id = ?
           AND status = 0
           AND TIMESTAMPDIFF(MINUTE, create_time, NOW()) <= 30`,
        [currentUserId]
      );

      const tableIds = validSessions.map((s) => s.table_id);

      if (tableIds.length > 0) {
        const placeholders = tableIds.map(() => "?").join(",");
        const [gameRooms] = await connection.execute(
          `SELECT 
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
             create_time as createTime
           FROM table_list WHERE id IN (${placeholders})`,
          tableIds
        );

        // 收集游戏房间用户ID 和 store_id
        const gameUserIds = new Set();
        const gameStoreIds = new Set();
        const gameParsedParticipantsMap = new Map();

        gameRooms.forEach((row, index) => {
          const participants = parseParticipants(row.participants);
          const validUserIds = extractUserIds(participants);
          gameParsedParticipantsMap.set(index, validUserIds);
          validUserIds.forEach((id) => gameUserIds.add(id));
          if (row.storeId) gameStoreIds.add(row.storeId);
        });

        // 查询游戏房间用户信息
        let gameUserMap = {};
        if (gameUserIds.size > 0) {
          gameUserMap = await fetchUserMap(connection, Array.from(gameUserIds));
        }

        // 查询游戏房间门店信息
        let gameStoreMap = {};
        if (gameStoreIds.size > 0) {
          gameStoreMap = await fetchStoreMap(
            connection,
            Array.from(gameStoreIds)
          );
        }

        // 组装 gameList
        gameList = gameRooms.map((row, index) => {
          const userIds = gameParsedParticipantsMap.get(index) || [];
          const isCurrentRoom = currentUserId
            ? userIds.includes(currentUserId)
            : false;

          row.participants = userIds
            .map((uid) => {
              const user = gameUserMap[uid];
              if (!user) return null;
              return {
                ...user,
                ...(currentUserId && uid === currentUserId
                  ? { isMe: true }
                  : {}),
              };
            })
            .filter(Boolean);

          row.isCurrentRoom = isCurrentRoom;
          row.storeInfo = gameStoreMap[row.storeId] || null;
          row.showId = encodeRoomId(row.id); // ✅ 同样加上混淆ID

          return row;
        });
      }
    }

    await connection.commit();

    res.json({
      code: 200,
      message: "success",
      list: processedResults,
      gameList,
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

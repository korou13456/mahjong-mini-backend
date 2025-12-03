// utils/roomHelpers.js
// 公共的房间相关工具方法，整合重复逻辑

// 解析 participants 字段为 number[]
function parseParticipants(participants) {
  if (!participants) return [];
  if (typeof participants === "string") {
    try {
      const arr = JSON.parse(participants);
      return Array.isArray(arr)
        ? arr.map((p) => parseInt(p)).filter((n) => !Number.isNaN(n))
        : [];
    } catch (e) {
      console.error("解析participants失败:", e);
      return [];
    }
  }
  return Array.isArray(participants)
    ? participants.map((p) => parseInt(p)).filter((n) => !Number.isNaN(n))
    : [];
}

// 将参与者数组持久化为字符串
function stringifyParticipants(participants) {
  return JSON.stringify(participants || []);
}

// 查询单个桌子（带必要字段）
async function getTableById(
  connection,
  tableId,
  fields = ["id", "participants", "status", "host_id"]
) {
  const select = fields.join(", ");
  const [rows] = await connection.execute(
    `SELECT ${select} FROM \`table_list\` WHERE id = ?`,
    [tableId]
  );
  return rows[0] || null;
}

// 退出房间的通用逻辑：移除用户、调整host与状态、更新users表
async function leaveRoom(connection, tableId, userId) {
  const table = await getTableById(connection, tableId, [
    "id",
    "participants",
    "status",
    "host_id",
    "req_num",
  ]);
  if (!table) return { changed: false, reason: "TABLE_NOT_FOUND" };

  let participants = parseParticipants(table.participants);
  const numericUserId = parseInt(userId);
  const userIndex = participants.indexOf(numericUserId);
  if (userIndex === -1) {
    return { changed: false, reason: "NOT_IN_ROOM" };
  }

  participants.splice(userIndex, 1);

  let newHostId = table.host_id;
  let newReqNum = table.req_num;
  
  // 如果退出的人是房主且 req_num 是 3，则改为 4
  if (parseInt(table.host_id) === numericUserId && table.req_num === 3) {
    newReqNum = 4;
  }
  
  if (parseInt(table.host_id) === numericUserId) {
    if (participants.length > 0) {
      newHostId = participants[0];
    } else {
      newHostId = numericUserId; // 无人时保留最后退出者id（与现有逻辑一致）
    }
  }

  const newStatus = participants.length === 0 ? 3 : table.status;

  if (newStatus == 0 || newStatus == 3)
    await connection.execute(
      "UPDATE `table_list` SET participants = ?, host_id = ?, status = ?, req_num = ? WHERE id = ?",
      [stringifyParticipants(participants), newHostId, newStatus, newReqNum, tableId]
    );

  await connection.execute(
    "UPDATE users SET status = 0, enter_room_id = NULL WHERE user_id = ?",
    [numericUserId]
  );

  return {
    changed: true,
    newHostId,
    newStatus,
    newReqNum,
    participants,
  };
}

// 加入房间的通用逻辑：检查容量、重复等，并更新users表
async function joinRoom(connection, tableId, userId, maxPlayers = 4) {
  const table = await getTableById(connection, tableId, ["id", "participants"]);
  if (!table) return { changed: false, reason: "TABLE_NOT_FOUND" };

  const numericUserId = parseInt(userId);
  let participants = parseParticipants(table.participants);

  if (participants.includes(numericUserId)) {
    return { changed: false, reason: "ALREADY_IN_ROOM" };
  }

  if (participants.length >= maxPlayers) {
    return { changed: false, reason: "ROOM_FULL" };
  }

  participants.push(numericUserId);
  await connection.execute(
    "UPDATE `table_list` SET participants = ? WHERE id = ?",
    [stringifyParticipants(participants), tableId]
  );

  await connection.execute(
    "UPDATE users SET status = 1, enter_room_id = ? WHERE user_id = ?",
    [tableId, numericUserId]
  );

  return { changed: true, participants, participants_num: participants.length };
}

/**
 * 查询指定用户ID列表的用户信息
 * @param {object} connection MySQL连接
 * @param {Array<number>} userIds 用户ID数组
 * @returns {Promise<Object>} userMap
 */
async function fetchUserMap(connection, userIds = []) {
  if (!userIds.length) return {};

  const placeholders = userIds.map(() => "?").join(",");
  const sql = `
    SELECT 
      id,
      user_id as userId,
      wxid,
      nickname,
      avatar_url as avatarUrl,
      gender,
      phone_num as phoneNum,
      is_subscribed as isSubscribed
    FROM users
    WHERE user_id IN (${placeholders})
  `;
  const [rows] = await connection.execute(sql, userIds);

  const userMap = {};
  rows.forEach((u) => {
    userMap[u.userId] = u;
  });
  return userMap;
}

/**
 * 查询指定门店ID列表的门店信息
 * @param {object} connection MySQL连接
 * @param {Array<number>} storeIds 门店ID数组
 * @returns {Promise<Object>} storeMap
 */
async function fetchStoreMap(connection, storeIds = []) {
  if (!storeIds.length) return {};

  const placeholders = storeIds.map(() => "?").join(",");
  const sql = `
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
  const [rows] = await connection.execute(sql, storeIds);

  const storeMap = {};
  rows.forEach((s) => {
    storeMap[s.storeId] = s;
  });
  return storeMap;
}

// === 新增：生成基于当天日期的盐值（如 20251106） ===
function getDailySalt() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  return Number(`${yyyy}${mm}${dd}`);
}

// === 新增：分离真实用户和虚拟用户ID ===
function separateUserIds(userIds) {
  const realUsers = userIds.filter((id) => id > 0);
  const virtualUsers = userIds.filter((id) => id < 0);
  return { realUsers, virtualUsers };
}

// === 新增：生成混淆后的 showId（四位版本）===
function encodeRoomId(id) {
  const salt = getDailySalt();
  const mixed = (id * 73 + salt) % 10000; // 改为模10000，得到0-9999
  return String(mixed).padStart(4, "0"); // 改为填充到4位
}

module.exports = {
  parseParticipants,
  stringifyParticipants,
  getTableById,
  leaveRoom,
  joinRoom,
  fetchUserMap,
  fetchStoreMap,
  separateUserIds,
  encodeRoomId,
};

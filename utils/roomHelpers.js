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
  if (parseInt(table.host_id) === numericUserId) {
    if (participants.length > 0) {
      newHostId = participants[0];
    } else {
      newHostId = numericUserId; // 无人时保留最后退出者id（与现有逻辑一致）
    }
  }

  const newStatus = participants.length === 0 ? 3 : table.status;

  await connection.execute(
    "UPDATE `table_list` SET participants = ?, host_id = ?, status = ? WHERE id = ?",
    [stringifyParticipants(participants), newHostId, newStatus, tableId]
  );

  await connection.execute(
    "UPDATE users SET status = 0, enter_room_id = NULL WHERE user_id = ?",
    [numericUserId]
  );

  return {
    changed: true,
    newHostId,
    newStatus,
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

module.exports = {
  parseParticipants,
  stringifyParticipants,
  getTableById,
  leaveRoom,
  joinRoom,
};

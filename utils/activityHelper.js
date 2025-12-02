const db = require("../config/database");
const { extractUserIdFromToken } = require("./tokenHelpers");

const activity = true; // 活动开启

/**
 * 获取活动开关状态
 * @param {Object} req - 请求对象
 * @returns {Promise<Object>} - 返回活动状态和用户类型信息
 */
const getActivityStatus = async (req) => {
  const connection = await db.getConnection();

  try {
    const userId = extractUserIdFromToken(req);

    // 根据userId查询users表中的user_type
    let userType = null;
    if (userId) {
      const [userResult] = await connection.execute(
        `SELECT user_type FROM users WHERE user_id = ?`,
        [userId]
      );
      userType = userResult[0]?.user_type;
    }

    return {
      activity: activity,
      userType: userType,
      userId: userId,
    };
  } catch (error) {
    console.error("获取活动开关状态失败:", error);
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * 检查用户是否有权限参与活动
 * @param {Object} req - 请求对象
 * @param {Array} allowedUserTypes - 允许的用户类型数组，默认允许所有类型
 * @returns {Promise<boolean>} - 返回是否有权限
 */
const checkActivityPermission = async (req, allowedUserTypes = null) => {
  try {
    const statusInfo = await getActivityStatus(req);
    // 如果活动关闭，直接返回false
    if (!statusInfo.activity && !statusInfo.userId) {
      return false;
    }

    // 如果没有指定允许的用户类型，则允许所有用户
    if (!allowedUserTypes || allowedUserTypes.length === 0) {
      return true;
    }

    // 检查用户类型是否在允许列表中
    return allowedUserTypes.includes(statusInfo.userType);
  } catch (error) {
    console.error("检查活动权限失败:", error);
    return false;
  }
};

module.exports = {
  getActivityStatus,
  checkActivityPermission,
};

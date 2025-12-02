const { checkActivityPermission } = require("../../utils/activityHelper");

// 获取活动开关状态
const getActivityStatusApi = async (req, res) => {
  try {
    // const statusInfo = await checkActivityPermission(req, [1, 2, 3]);

    res.json({
      success: true,
      data: {
        activity: true,
      },
    });
  } catch (error) {
    console.error("获取活动开关状态失败:", error);
    res.status(500).json({
      success: false,
      message: "服务器内部错误",
    });
  }
};

module.exports = {
  getActivityStatus: getActivityStatusApi,
};

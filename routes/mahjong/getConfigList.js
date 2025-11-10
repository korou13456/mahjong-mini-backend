// routes/mahjong/getConfigList.js
const db = require("../../config/database");

// 获取配置接口
const getConfigList = async (req, res) => {
  try {
    const sql = `
      SELECT 
        config_key as configKey,
        config_id as configId, 
        config_value as configValue
      FROM configs 
      WHERE config_key IN (1, 2, 3, 4, 5, 6)
      ORDER BY config_key, config_id
    `;

    const [results] = await db.execute(sql);

    // 按配置类型分组
    const configs = {
      mahjongType: [], // 1: 麻将类型
      duration: [], // 2: 房间持续时间
      payType: [], // 3: 房费支付方式
      genderPref: [], // 4: 男女限制
      scoringTier: [], // 5: 计分方式
      requirements: [], // 6: 需求
    };

    results.forEach((item) => {
      switch (item.configKey) {
        case 1:
          configs.mahjongType.push({
            id: item.configId,
            value: item.configValue,
          });
          break;
        case 2:
          configs.duration.push({
            id: item.configId,
            value: item.configValue,
          });
          break;
        case 3:
          configs.payType.push({
            id: item.configId,
            value: item.configValue,
          });
          break;
        case 4:
          configs.genderPref.push({
            id: item.configId,
            value: item.configValue,
          });
          break;
        case 5:
          configs.scoringTier.push({
            id: item.configId,
            value: item.configValue,
          });
        case 6:
          configs.requirements.push({
            id: item.configId,
            value: item.configValue,
          });
          break;
      }
    });

    res.json({
      code: 200,
      message: "success",
      list: configs,
    });
  } catch (error) {
    console.error("获取配置失败:", error);
    res.status(500).json({
      code: 500,
      message: "获取配置失败",
      error: error.message,
    });
  }
};

module.exports = getConfigList;

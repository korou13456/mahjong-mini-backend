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
      WHERE config_key IN (1, 2, 3, 4, 5)
      ORDER BY config_key, config_id
    `;

    const [results] = await db.execute(sql);

    // 按配置类型分组
    const configs = {
      mahjong_type: [], // 1: 麻将类型
      duration: [], // 2: 房间持续时间
      pay_type: [], // 3: 房费支付方式
      gender_pref: [], // 4: 男女限制
      scoring_tier: [], // 5: 计分方式
    };

    results.forEach((item) => {
      switch (item.configKey) {
        case 1:
          configs.mahjong_type.push({
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
          configs.pay_type.push({
            id: item.configId,
            value: item.configValue,
          });
          break;
        case 4:
          configs.gender_pref.push({
            id: item.configId,
            value: item.configValue,
          });
          break;
        case 5:
          configs.scoring_tier.push({
            id: item.configId,
            value: item.configValue,
          });
          break;
      }
    });

    res.json({
      code: 200,
      message: "success",
      data: configs,
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

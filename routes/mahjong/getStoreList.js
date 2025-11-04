const db = require("../../config/database");

// 获取商家列表接口
const getStoreList = async (req, res) => {
  try {
    const { city, district, status = 1 } = req.query;

    // 构建基础 SQL 查询
    let sql = `
      SELECT 
        id,
        store_name AS storeName,
        address_detail AS addressDetail,
        business_hours_start AS businessHoursStart,
        business_hours_end AS businessHoursEnd,
        city,
        district,
        latitude,
        longitude,
        manager_name AS managerName,
        manager_phone AS managerPhone,
        service_wxid AS serviceWxid,
        province,
        status,
        store_image AS storeImage,
        create_time AS createTime
      FROM stores
      WHERE status = ?
    `;
    const params = [status];

    if (city) {
      sql += " AND city = ?";
      params.push(city);
    }

    if (district) {
      sql += " AND district = ?";
      params.push(district);
    }

    sql += " ORDER BY create_time DESC";

    // 执行 SQL 查询
    const [results] = await db.execute(sql, params);

    res.json({
      code: 200,
      message: "success",
      data: results, // 已经是驼峰字段，无需再格式化
    });
  } catch (error) {
    console.error("获取商家失败:", error);
    res.status(500).json({
      code: 500,
      message: "获取商家失败",
      error: error.message,
    });
  }
};

module.exports = getStoreList;

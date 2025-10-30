const db = require("../../config/database");

// 获取商家接口
const getStoreList = async (req, res) => {
  try {
    const { city, district, status = 1 } = req.query;

    let sql = `
      SELECT 
        id,
        store_name,
        address_detail,
        business_hours_start,
        business_hours_end,
        city,
        district,
        latitude,
        longitude,
        manager_name,
        manager_phone,
        service_wxid,
        status,
        store_image,
        create_time
      FROM stores 
      WHERE status = ?
    `;

    const params = [status];

    if (city) {
      sql += ` AND city = ?`;
      params.push(city);
    }

    if (district) {
      sql += ` AND district = ?`;
      params.push(district);
    }

    sql += ` ORDER BY create_time DESC`;

    const [results] = await db.execute(sql, params);

    res.json({
      code: 200,
      message: "success",
      data: results,
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

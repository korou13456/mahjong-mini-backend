const db = require("../../config/database");

const getTableList = async (req, res) => {
  try {
    const sql = `
      SELECT 
        *
      FROM \`table-list\` 
      ORDER BY create_time DESC
    `;

    const [results] = await db.execute(sql);

    res.json({
      code: 200,
      message: "success",
      data: results,
    });
  } catch (error) {
    console.error("获取房间列表失败:", error);
    res.status(500).json({
      code: 500,
      message: "获取房间列表失败",
      error: error.message,
    });
  }
};

module.exports = getTableList;

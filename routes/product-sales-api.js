const express = require("express");
const router = express.Router();
const db = require("../config/database");

// 获取所有商品
router.get("/products", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, shop_id, product_id, title FROM product WHERE status = 1`
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error("获取商品列表失败:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 批量插入或更新销量数据
router.post("/product-sales-daily", async (req, res) => {
  try {
    const { salesData } = req.body;

    if (!Array.isArray(salesData) || salesData.length === 0) {
      return res.json({ success: true, message: "无数据需要处理" });
    }

    const sql = `
      INSERT INTO product_sales_daily (product_id, order_date, order_count)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        order_count = VALUES(order_count)
    `;

    const values = salesData.map((item) => [
      item.product_id,
      item.order_date,
      item.order_count,
    ]);

    await db.query(sql, [values]);

    res.json({
      success: true,
      message: `成功处理 ${salesData.length} 条销量数据`,
    });
  } catch (error) {
    console.error("保存销量数据失败:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

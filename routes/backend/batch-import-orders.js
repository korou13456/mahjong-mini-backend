// 批量导入订单数据
const db = require("../../config/database");

async function batchImportOrders(req, res) {
  try {
    const { username: staff_name, department } = req.user || {};
    const orders = req.body.data || req.body;

    if (!Array.isArray(orders) || orders.length === 0) {
      return res.status(400).json({
        code: 400,
        message: "订单数据不能为空",
      });
    }

    let addedCount = 0;
    let updatedCount = 0;
    const errors = [];

    for (const order of orders) {
      try {
        if (!order.order_item_id) {
          throw new Error("order_item_id 不能为空");
        }

        // 查询订单是否存在
        const [existing] = await db.query(
          `SELECT id FROM order_product_record WHERE order_item_id = ?`,
          [order.order_item_id]
        );

        if (existing.length > 0) {
          // 订单存在，更新
          await db.query(
            `UPDATE order_product_record
             SET order_id = ?, category = ?, variation = ?, quantity = ?, price = ?,
                 status = ?, purchase_date_america = ?, purchase_date_china = ?
             WHERE order_item_id = ?`,
            [
              order.order_id,
              order.category,
              order.variation || null,
              order.quantity || 1,
              order.price,
              order.status !== undefined ? order.status : 1,
              order.purchase_date_america,
              order.purchase_date_china,
              order.order_item_id,
            ]
          );
          updatedCount++;
        } else {
          // 订单不存在，插入
          await db.query(
            `INSERT INTO order_product_record (order_id, order_item_id, category, variation, quantity, price, department, staff_name, status, purchase_date_america, purchase_date_china)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              order.order_id,
              order.order_item_id,
              order.category,
              order.variation || null,
              order.quantity || 1,
              order.price,
              department,
              staff_name,
              order.status !== undefined ? order.status : 1,
              order.purchase_date_america,
              order.purchase_date_china,
            ]
          );
          addedCount++;
        }
      } catch (err) {
        errors.push({ order_item_id: order.order_item_id, error: err.message });
      }
    }

    res.json({
      code: 200,
      message: "导入完成",
      data: {
        addedCount,
        updatedCount,
        errors,
      },
    });
  } catch (error) {
    console.error("批量导入订单失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = batchImportOrders;

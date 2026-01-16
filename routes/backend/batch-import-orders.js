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

    // 验证数据
    for (const order of orders) {
      if (!order.order_item_id) {
        return res.status(400).json({
          code: 400,
          message: "order_item_id 不能为空",
        });
      }
    }

    const orderItemIds = orders.map((o) => o.order_item_id);

    // 批量查询已存在的订单
    const [existingRecords] = await db.query(
      `SELECT id, order_item_id FROM order_product_record WHERE order_item_id IN (?)`,
      [orderItemIds]
    );

    const existingMap = new Map(
      existingRecords.map((r) => [r.order_item_id, r.id])
    );

    // 分类处理：待插入和待更新的数据
    const toInsert = [];
    const toUpdate = [];

    for (const order of orders) {
      if (existingMap.has(order.order_item_id)) {
        toUpdate.push(order);
      } else {
        toInsert.push(order);
      }
    }

    // 批量插入
    let addedCount = 0;
    if (toInsert.length > 0) {
      const insertValues = toInsert
        .map(
          (o) =>
            `(${db.escape(o.order_id)}, ${db.escape(
              o.order_item_id
            )}, ${db.escape(o.category)}, ${db.escape(o.variation || null)}, ${
              o.quantity || 1
            }, ${o.price}, ${db.escape(department)}, ${db.escape(
              staff_name
            )}, ${o.status !== undefined ? o.status : 1}, ${db.escape(
              o.purchase_date_america
            )}, ${db.escape(o.purchase_date_china)}, ${db.escape(
              o.recipient_name || null
            )})`
        )
        .join(", ");

      await db.query(
        `INSERT INTO order_product_record (order_id, order_item_id, category, variation, quantity, price, department, staff_name, status, purchase_date_america, purchase_date_china, recipient_name)
         VALUES ${insertValues}`
      );
      addedCount = toInsert.length;
    }

    // 批量更新
    let updatedCount = 0;
    if (toUpdate.length > 0) {
      await Promise.all(
        toUpdate.map((order) =>
          db.query(
            `UPDATE order_product_record
             SET order_id = ?, category = ?, variation = ?, quantity = ?, price = ?,
                 status = ?, purchase_date_america = ?, purchase_date_china = ?, recipient_name = ?
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
              order.recipient_name || null,
              order.order_item_id,
            ]
          )
        )
      );
      updatedCount = toUpdate.length;
    }

    res.json({
      code: 200,
      message: "导入完成",
      data: {
        addedCount,
        updatedCount,
        errors: [],
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

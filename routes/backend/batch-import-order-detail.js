const db = require("../../config/database");

module.exports = async (req, res) => {
  try {
    const { data } = req.body;
    const { username: staff_name, department } = req.user || {};

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        code: 400,
        message: "请提供有效的数据数组",
      });
    }

    // ========== 步骤1：内存层去重（前端上传的重复order_item_id） ==========
    const memoryOrderItemIdMap = new Map();
    const uniqueDataFromFront = []; // 前端去重后的数据
    const failedByMemoryDuplicate = []; // 前端重复的失败记录

    data.forEach((item) => {
      const orderItemId = item.order_item_id;
      if (memoryOrderItemIdMap.has(orderItemId)) {
        // 前端上传的重复order_item_id，标记为失败
        failedByMemoryDuplicate.push({
          order_item_id: orderItemId,
        });
      } else {
        memoryOrderItemIdMap.set(orderItemId, item);
        uniqueDataFromFront.push({ order_item_id: orderItemId, item });
      }
    });

    // ========== 步骤2：直接去重后的数据都进行插入/更新 ==========
    // 不再查询数据库，直接使用 ON DUPLICATE KEY UPDATE 处理

    // ========== 步骤3：批量插入/更新最终有效数据 ==========
    let insertedCount = 0;
    let updatedCount = 0;
    const successTransactions = [];
    // 合并所有失败记录（前端重复）
    const failedTransactions = [...failedByMemoryDuplicate];

    if (uniqueDataFromFront.length > 0) {
      const values = uniqueDataFromFront.map(({ order_item_id, item }) => [
        item.order_id,
        item.recipient_name,
        item.ship_city,
        item.ship_state,
        item.ship_postal_code,
        order_item_id,
        item.order_status,
        item.order_settlement_status,
        item.quantity,
        item.price,
        department,
        staff_name,
        item.purchase_date_america,
        item.purchase_date_china,
        item.latest_shipping_time_america,
        item.latest_shipping_time_china,
        item.latest_delivery_time_america,
        item.latest_delivery_time_china,
      ]);

      const sql = `
        INSERT INTO order_detail (
          order_id,
          recipient_name,
          ship_city,
          ship_state,
          ship_postal_code,
          order_item_id,
          order_status,
          order_settlement_status,
          quantity,
          price,
          department,
          staff_name,
          purchase_date_america,
          purchase_date_china,
          latest_shipping_time_america,
          latest_shipping_time_china,
          latest_delivery_time_america,
          latest_delivery_time_china
        ) VALUES ?
        ON DUPLICATE KEY UPDATE
          order_id = VALUES(order_id),
          recipient_name = VALUES(recipient_name),
          ship_city = VALUES(ship_city),
          ship_state = VALUES(ship_state),
          ship_postal_code = VALUES(ship_postal_code),
          order_status = VALUES(order_status),
          order_settlement_status = VALUES(order_settlement_status),
          quantity = VALUES(quantity),
          price = VALUES(price),
          department = VALUES(department),
          staff_name = VALUES(staff_name),
          purchase_date_america = VALUES(purchase_date_america),
          purchase_date_china = VALUES(purchase_date_china),
          latest_shipping_time_america = VALUES(latest_shipping_time_america),
          latest_shipping_time_china = VALUES(latest_shipping_time_china),
          latest_delivery_time_america = VALUES(latest_delivery_time_america),
          latest_delivery_time_china = VALUES(latest_delivery_time_china)
      `;

      const [result] = await db.query(sql, [values]);
      insertedCount = result.affectedRows - result.changedRows; // 新增数量
      updatedCount = result.changedRows; // 更新数量

      // 组装成功入库的记录
      successTransactions.push(
        ...uniqueDataFromFront.map(({ order_item_id, item }) => ({
          order_item_id: order_item_id,
        })),
      );
    }

    // ========== 步骤5：返回精准的响应数据 ==========
    const totalUpload = data.length; // 前端上传总数

    res.json({
      code: 200,
      message: `批量导入完成，上传${totalUpload}条，新增${insertedCount}条，更新${updatedCount}条，失败${failedTransactions.length}条`,
      data: {
        total: totalUpload, // 前端上传总数
        insertedCount, // 新增数量
        updatedCount, // 更新数量
        successTransactions, // 成功入库的记录
        failedTransactions, // 失败记录（仅前端重复）
      },
    });
  } catch (error) {
    console.error("批量导入订单详情失败:", error);
    res.status(500).json({
      code: 500,
      message: "批量导入失败",
      error: error.message,
    });
  }
};

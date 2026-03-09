const db = require("../../config/database");

module.exports = async (req, res) => {
  try {
    const { data } = req.body;

    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        code: 400,
        message: "请提供有效的数据数组",
      });
    }

    // ========== 步骤1：内存层去重（前端上传的重复UUID） ==========
    const memoryUuidMap = new Map();
    const uniqueDataFromFront = []; // 前端去重后的数据
    const failedByMemoryDuplicate = []; // 前端重复的失败记录

    data.forEach((item) => {
      const uuid = item.uuid;
      if (memoryUuidMap.has(uuid)) {
        // 前端上传的重复UUID，标记为失败
        failedByMemoryDuplicate.push({
          uuid,
          finance_time: item.finance_time,
          transaction_type: item.transaction_type,
          order_id: item.order_id,
          order_item_id: item.order_item_id,
          sku_id: item.sku_id,
        });
      } else {
        memoryUuidMap.set(uuid, item);
        uniqueDataFromFront.push({ uuid, item });
      }
    });

    // ========== 步骤2：批量插入或更新数据（使用 ON DUPLICATE KEY UPDATE） ==========
    let insertedCount = 0;
    let updatedCount = 0;
    const successTransactions = [];
    // 只有前端重复的失败记录
    const failedTransactions = [...failedByMemoryDuplicate];

    if (uniqueDataFromFront.length > 0) {
      const values = uniqueDataFromFront.map(({ uuid, item }) => [
        uuid,
        item.finance_time || null,
        item.transaction_type,
        item.order_id,
        item.order_item_id || null,
        item.sku_id,
        item.ship_state,
        item.subtotal,
        item.shipping,
        item.total,
      ]);

      const sql = `
        INSERT INTO finance_transaction_detail (
          uuid,
          finance_time,
          transaction_type,
          order_id,
          order_item_id,
          sku_id,
          ship_state,
          subtotal,
          shipping,
          total
        ) VALUES ?
        ON DUPLICATE KEY UPDATE
          finance_time = VALUES(finance_time),
          transaction_type = VALUES(transaction_type),
          order_id = VALUES(order_id),
          order_item_id = VALUES(order_item_id),
          sku_id = VALUES(sku_id),
          ship_state = VALUES(ship_state),
          subtotal = VALUES(subtotal),
          shipping = VALUES(shipping),
          total = VALUES(total)
      `;

      const [result] = await db.query(sql, [values]);
      insertedCount = result.affectedRows;

      // 计算新增和更新数量
      // affectedRows = 新增数量 + 2 * 更新数量（MySQL特性）
      // 如果 affectedRows > uniqueDataFromFront.length，说明有更新
      if (insertedCount > uniqueDataFromFront.length) {
        updatedCount = (insertedCount - uniqueDataFromFront.length) / 2;
        insertedCount = uniqueDataFromFront.length - updatedCount;
      }

      // 组装成功入库的记录
      successTransactions.push(
        ...uniqueDataFromFront.map(({ uuid, item }) => ({
          uuid,
          finance_time: item.finance_time,
          transaction_type: item.transaction_type,
          order_id: item.order_id,
          order_item_id: item.order_item_id,
          sku_id: item.sku_id,
        })),
      );
    }

    // ========== 步骤3：返回精准的响应数据 ==========
    const totalUpload = data.length; // 前端上传总数

    res.json({
      code: 200,
      message: `批量导入完成，上传${totalUpload}条，新增${insertedCount}条，更新${updatedCount}条，失败${failedTransactions.length}条`,
      data: {
        total: totalUpload, // 前端上传总数
        insertedCount, // 新增数量
        updatedCount, // 更新数量
        successTransactions, // 成功入库的记录（包括新增和更新）
        failedTransactions, // 前端重复的失败记录
      },
    });
  } catch (error) {
    console.error("批量导入财务交易明细失败:", error);
    res.status(500).json({
      code: 500,
      message: "批量导入失败",
      error: error.message,
    });
  }
};

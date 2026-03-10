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

    // ========= 步骤1：前端数据内存去重 =========
    const uuidSet = new Set();
    const uniqueData = [];
    const failedTransactions = [];

    data.forEach((item) => {
      const uuid = item.uuid;

      if (!uuid) {
        failedTransactions.push({
          uuid: null,
          order_id: item.order_id,
          order_item_id: item.order_item_id,
          reason: "uuid为空",
        });
        return;
      }

      if (uuidSet.has(uuid)) {
        failedTransactions.push({
          uuid,
          order_id: item.order_id,
          order_item_id: item.order_item_id,
          reason: "前端数据UUID重复",
        });
      } else {
        uuidSet.add(uuid);
        uniqueData.push(item);
      }
    });

    // ========= 步骤2：准备批量插入 =========
    const values = uniqueData.map((item) => [
      item.uuid,
      item.finance_time || null,
      item.transaction_type || null,
      item.order_id || null,
      item.order_item_id || null,
      item.sku_id || null,
      item.ship_state || null,
      item.subtotal || 0,
      item.shipping || 0,
      item.total || 0,
      department || null,
      staff_name || null,
    ]);

    let insertedCount = 0;

    if (values.length > 0) {
      const sql = `
        INSERT IGNORE INTO finance_transaction_detail (
          uuid,
          finance_time,
          transaction_type,
          order_id,
          order_item_id,
          sku_id,
          ship_state,
          subtotal,
          shipping,
          total,
          department,
          staff_name
        ) VALUES ?
      `;

      const [result] = await db.query(sql, [values]);

      insertedCount = result.affectedRows;
    }

    // ========= 步骤3：计算数据库重复 =========
    const dbDuplicateCount = uniqueData.length - insertedCount;

    if (dbDuplicateCount > 0) {
      const duplicateItems = uniqueData.slice(insertedCount);

      duplicateItems.forEach((item) => {
        failedTransactions.push({
          uuid: item.uuid,
          order_id: item.order_id,
          order_item_id: item.order_item_id,
          reason: "数据库UUID重复",
        });
      });
    }

    // ========= 步骤4：成功数据 =========
    const successTransactions = uniqueData
      .slice(0, insertedCount)
      .map((item) => ({
        uuid: item.uuid,
        order_id: item.order_id,
        order_item_id: item.order_item_id,
        department: department || null,
        staff_name: staff_name || null,
      }));

    const totalUpload = data.length;

    // ========= 步骤5：返回结果 =========
    res.json({
      code: 200,
      message: `上传${totalUpload}条，成功${insertedCount}条，失败${failedTransactions.length}条`,
      data: {
        total: totalUpload,
        insertedCount,
        failedCount: failedTransactions.length,
        successTransactions,
        failedTransactions,
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

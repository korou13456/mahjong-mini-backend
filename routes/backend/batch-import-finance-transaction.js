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
          sku_id: item.sku_id,
        });
      } else {
        memoryUuidMap.set(uuid, item);
        uniqueDataFromFront.push({ uuid, item });
      }
    });

    // ========== 步骤2：查询数据库已存在的UUID ==========
    const frontUniqueUuids = uniqueDataFromFront.map((item) => item.uuid);
    let existedUuids = [];
    if (frontUniqueUuids.length > 0) {
      // 批量查询数据库中已存在的UUID
      const [existedRows] = await db.query(
        `SELECT uuid FROM finance_transaction_detail WHERE uuid IN (?)`,
        [frontUniqueUuids],
      );
      existedUuids = existedRows.map((row) => row.uuid);
    }

    // ========== 步骤3：过滤掉数据库已存在的UUID ==========
    const finalValidData = []; // 最终要入库的有效数据（内存+数据库都不重复）
    const failedByDbExisted = []; // 数据库已存在的失败记录

    uniqueDataFromFront.forEach(({ uuid, item }) => {
      if (existedUuids.includes(uuid)) {
        // 数据库已存在该UUID，标记为失败
        failedByDbExisted.push({
          uuid,
          finance_time: item.finance_time,
          transaction_type: item.transaction_type,
          order_id: item.order_id,
          sku_id: item.sku_id,
        });
      } else {
        // 全新UUID，加入入库列表
        finalValidData.push({ uuid, item });
      }
    });

    // ========== 步骤4：批量插入最终有效数据 ==========
    let insertedCount = 0;
    const successTransactions = [];
    // 合并所有失败记录（前端重复 + 数据库已存在）
    const failedTransactions = [
      ...failedByMemoryDuplicate,
      ...failedByDbExisted,
    ];

    if (finalValidData.length > 0) {
      const values = finalValidData.map(({ uuid, item }) => [
        uuid,
        item.finance_time || null,
        item.transaction_type,
        item.order_id,
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
          sku_id,
          ship_state,
          subtotal,
          shipping,
          total
        ) VALUES ?
      `;

      const [result] = await db.query(sql, [values]);
      insertedCount = result.affectedRows; // 实际新增数量

      // 组装成功入库的记录
      successTransactions.push(
        ...finalValidData.map(({ uuid, item }) => ({
          uuid,
          finance_time: item.finance_time,
          transaction_type: item.transaction_type,
          order_id: item.order_id,
          sku_id: item.sku_id,
        })),
      );
    }

    // ========== 步骤5：返回精准的响应数据 ==========
    const actualInsertedTotal = insertedCount; // 实际入库数 = 新增数
    const totalUpload = data.length; // 前端上传总数

    res.json({
      code: 200,
      message: `批量导入完成，上传${totalUpload}条，实际入库${actualInsertedTotal}条，失败${failedTransactions.length}条`,
      data: {
        total: totalUpload, // 前端上传总数
        actualInsertedTotal, // 实际入库总数（仅全新数据）
        insertedCount, // 新增数量（=实际入库数）
        successTransactions, // 成功入库的记录
        failedTransactions, // 所有失败记录（前端重复+数据库已存在）
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

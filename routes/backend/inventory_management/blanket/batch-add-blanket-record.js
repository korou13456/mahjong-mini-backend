// 批量新增毛毯库存记录
const db = require("../../../../config/database");
const generateBatchHash = require("../../../../utils/generate-batch-hash");

async function batchAddBlanketRecord(req, res) {
  try {
    const { records } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.json({
        code: 400,
        message: "记录列表不能为空",
      });
    }

    // 验证每条记录
    for (const record of records) {
      if (!record.record_date) {
        return res.json({
          code: 400,
          message: "记录日期不能为空",
        });
      }
      if (record.status === undefined || record.status === null) {
        return res.json({
          code: 400,
          message: "状态不能为空",
        });
      }
      if (![0, 1, 2].includes(record.status)) {
        return res.json({
          code: 400,
          message: "状态值无效，应为 0(在路上)、1(入库)、2(出库)",
        });
      }
    }

    let successCount = 0;
    let duplicateCount = 0;
    const toInsert = [];
    const inventoryUpdates = [];

    // 批量检查hash
    const allHashes = records.map(r => generateBatchHash(r));
    const [existingRecords] = await db.query(
      `SELECT batch_hash FROM blanket_inventory_record WHERE batch_hash IN (${allHashes.map(() => '?').join(',')})`,
      allHashes
    );
    const existingHashes = new Set(existingRecords.map(r => r.batch_hash));

    for (const record of records) {
      const {
        record_date,
        status,
        size_40_30 = 0,
        size_50_40 = 0,
        size_60_50 = 0,
        size_60_70 = 0,
        size_80_60 = 0,
        remark,
        image_urls,
      } = record;

      const batch_hash = generateBatchHash(record);

      if (existingHashes.has(batch_hash)) {
        duplicateCount++;
        continue;
      }

      // status=2时，明细表数据也要乘以-1
      const multiplier = status === 2 ? -1 : 1;

      toInsert.push([
        record_date,
        status,
        size_40_30 * multiplier,
        size_50_40 * multiplier,
        size_60_50 * multiplier,
        size_60_70 * multiplier,
        size_80_60 * multiplier,
        remark || null,
        image_urls ? JSON.stringify(image_urls) : null,
        batch_hash
      ]);

      // 只有入库(1)和出库(2)才更新总量表，在路上(0)不更新
      if (status === 1 || status === 2) {
        inventoryUpdates.push([
          size_40_30 * multiplier,
          size_50_40 * multiplier,
          size_60_50 * multiplier,
          size_60_70 * multiplier,
          size_80_60 * multiplier
        ]);
      }

      successCount++;
    }

    // 批量插入明细记录
    if (toInsert.length > 0) {
      const placeholders = toInsert.map(() => '(?,?,?,?,?,?,?,?,?,?)').join(',');
      const flattened = toInsert.flat();
      await db.query(
        `INSERT INTO blanket_inventory_record
         (record_date, status, size_40_30, size_50_40, size_60_50, size_60_70, size_80_60, remark, image_urls, batch_hash)
         VALUES ${placeholders}`,
        flattened
      );
    }

    // 批量更新库存总表
    if (inventoryUpdates.length > 0) {
      const totalChange = inventoryUpdates.reduce((acc, curr) =>
        [acc[0] + curr[0], acc[1] + curr[1], acc[2] + curr[2], acc[3] + curr[3], acc[4] + curr[4]],
        [0, 0, 0, 0, 0]
      );
      await db.query(
        `UPDATE blanket_inventory SET
         size_40_30 = size_40_30 + ?,
         size_50_40 = size_50_40 + ?,
         size_60_50 = size_60_50 + ?,
         size_60_70 = size_60_70 + ?,
         size_80_60 = size_80_60 + ?,
         updated_at = CURRENT_TIMESTAMP`,
        totalChange
      );
    }

    const message = duplicateCount > 0
      ? `成功添加 ${successCount} 条记录，跳过 ${duplicateCount} 条重复记录`
      : `成功添加 ${successCount} 条记录`;

    res.json({
      code: 200,
      message: message,
      successCount,
      duplicateCount,
    });
  } catch (error) {
    console.error("批量添加毛毯库存记录失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = batchAddBlanketRecord;

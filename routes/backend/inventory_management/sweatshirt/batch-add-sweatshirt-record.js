// 批量新增卫衣库存记录
const db = require("../../../../config/database");
const generateBatchHash = require("../../../../utils/generate-batch-hash");

async function batchAddSweatshirtRecord(req, res) {
  try {
    const { records } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.json({ code: 400, message: "记录列表不能为空" });
    }

    for (const record of records) {
      if (!record.record_date) return res.json({ code: 400, message: "记录日期不能为空" });
      if (record.status === undefined || record.status === null) return res.json({ code: 400, message: "状态不能为空" });
      if (![0, 1, 2].includes(record.status)) return res.json({ code: 400, message: "状态值无效，应为 0(在路上)、1(入库)、2(出库)" });
    }

    let successCount = 0;
    let duplicateCount = 0;
    const toInsert = [];
    const inventoryUpdates = [];

    // 批量检查hash
    const allHashes = records.map(r => generateBatchHash(r));
    const [existingRecords] = await db.query(
      `SELECT batch_hash FROM sweatshirt_inventory_record WHERE batch_hash IN (${allHashes.map(() => '?').join(',')})`,
      allHashes
    );
    const existingHashes = new Set(existingRecords.map(r => r.batch_hash));

    for (const record of records) {
      const {
        record_date, status,
        black_s = 0, black_m = 0, black_l = 0, black_xl = 0, black_xxl = 0, black_3xl = 0, black_4xl = 0, black_5xl = 0,
        gray_s = 0, gray_m = 0, gray_l = 0, gray_xl = 0, gray_xxl = 0, gray_3xl = 0, gray_4xl = 0, gray_5xl = 0,
        navy_s = 0, navy_m = 0, navy_l = 0, navy_xl = 0, navy_xxl = 0, navy_3xl = 0, navy_4xl = 0, navy_5xl = 0,
        white_s = 0, white_m = 0, white_l = 0, white_xl = 0, white_xxl = 0, white_3xl = 0, white_4xl = 0, white_5xl = 0,
        remark, image_urls,
      } = record;

      const batch_hash = generateBatchHash(record);

      if (existingHashes.has(batch_hash)) {
        duplicateCount++;
        continue;
      }

      // status=2时，明细表数据也要乘以-1
      const multiplier = status === 2 ? -1 : 1;

      toInsert.push([
        record_date, status,
        black_s * multiplier, black_m * multiplier, black_l * multiplier, black_xl * multiplier, black_xxl * multiplier, black_3xl * multiplier, black_4xl * multiplier, black_5xl * multiplier,
        gray_s * multiplier, gray_m * multiplier, gray_l * multiplier, gray_xl * multiplier, gray_xxl * multiplier, gray_3xl * multiplier, gray_4xl * multiplier, gray_5xl * multiplier,
        navy_s * multiplier, navy_m * multiplier, navy_l * multiplier, navy_xl * multiplier, navy_xxl * multiplier, navy_3xl * multiplier, navy_4xl * multiplier, navy_5xl * multiplier,
        white_s * multiplier, white_m * multiplier, white_l * multiplier, white_xl * multiplier, white_xxl * multiplier, white_3xl * multiplier, white_4xl * multiplier, white_5xl * multiplier,
        remark || null, image_urls ? JSON.stringify(image_urls) : null, batch_hash,
      ]);

      // 只有入库(1)和出库(2)才更新总量表，在路上(0)不更新
      if (status === 1 || status === 2) {
        inventoryUpdates.push([
          black_s * multiplier, black_m * multiplier, black_l * multiplier, black_xl * multiplier, black_xxl * multiplier, black_3xl * multiplier, black_4xl * multiplier, black_5xl * multiplier,
          gray_s * multiplier, gray_m * multiplier, gray_l * multiplier, gray_xl * multiplier, gray_xxl * multiplier, gray_3xl * multiplier, gray_4xl * multiplier, gray_5xl * multiplier,
          navy_s * multiplier, navy_m * multiplier, navy_l * multiplier, navy_xl * multiplier, navy_xxl * multiplier, navy_3xl * multiplier, navy_4xl * multiplier, navy_5xl * multiplier,
          white_s * multiplier, white_m * multiplier, white_l * multiplier, white_xl * multiplier, white_xxl * multiplier, white_3xl * multiplier, white_4xl * multiplier, white_5xl * multiplier,
        ]);
      }

      successCount++;
    }

    // 批量插入明细记录
    if (toInsert.length > 0) {
      const placeholders = toInsert.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
      const flattened = toInsert.flat();
      await db.query(
        `INSERT INTO sweatshirt_inventory_record
         (record_date, status,
          black_s, black_m, black_l, black_xl, black_xxl, black_3xl, black_4xl, black_5xl,
          gray_s, gray_m, gray_l, gray_xl, gray_xxl, gray_3xl, gray_4xl, gray_5xl,
          navy_s, navy_m, navy_l, navy_xl, navy_xxl, navy_3xl, navy_4xl, navy_5xl,
          white_s, white_m, white_l, white_xl, white_xxl, white_3xl, white_4xl, white_5xl,
          remark, image_urls, batch_hash)
         VALUES ${placeholders}`,
        flattened
      );
    }

    // 批量更新库存总表
    if (inventoryUpdates.length > 0) {
      const totalChange = inventoryUpdates.reduce((acc, curr) =>
        [
          acc[0] + curr[0], acc[1] + curr[1], acc[2] + curr[2], acc[3] + curr[3], acc[4] + curr[4], acc[5] + curr[5], acc[6] + curr[6], acc[7] + curr[7],
          acc[8] + curr[8], acc[9] + curr[9], acc[10] + curr[10], acc[11] + curr[11], acc[12] + curr[12], acc[13] + curr[13], acc[14] + curr[14], acc[15] + curr[15],
          acc[16] + curr[16], acc[17] + curr[17], acc[18] + curr[18], acc[19] + curr[19], acc[20] + curr[20], acc[21] + curr[21], acc[22] + curr[22], acc[23] + curr[23],
          acc[24] + curr[24], acc[25] + curr[25], acc[26] + curr[26], acc[27] + curr[27], acc[28] + curr[28], acc[29] + curr[29], acc[30] + curr[30], acc[31] + curr[31],
        ],
        Array(32).fill(0)
      );
      await db.query(
        `UPDATE sweatshirt_inventory SET
         black_s = black_s + ?, black_m = black_m + ?, black_l = black_l + ?, black_xl = black_xl + ?, black_xxl = black_xxl + ?, black_3xl = black_3xl + ?, black_4xl = black_4xl + ?, black_5xl = black_5xl + ?,
         gray_s = gray_s + ?, gray_m = gray_m + ?, gray_l = gray_l + ?, gray_xl = gray_xl + ?, gray_xxl = gray_xxl + ?, gray_3xl = gray_3xl + ?, gray_4xl = gray_4xl + ?, gray_5xl = gray_5xl + ?,
         navy_s = navy_s + ?, navy_m = navy_m + ?, navy_l = navy_l + ?, navy_xl = navy_xl + ?, navy_xxl = navy_xxl + ?, navy_3xl = navy_3xl + ?, navy_4xl = navy_4xl + ?, navy_5xl = navy_5xl + ?,
         white_s = white_s + ?, white_m = white_m + ?, white_l = white_l + ?, white_xl = white_xl + ?, white_xxl = white_xxl + ?, white_3xl = white_3xl + ?, white_4xl = white_4xl + ?, white_5xl = white_5xl + ?,
         updated_at = CURRENT_TIMESTAMP`,
        totalChange
      );
    }

    const message = duplicateCount > 0
      ? `成功添加 ${successCount} 条记录，跳过 ${duplicateCount} 条重复记录`
      : `成功添加 ${successCount} 条记录`;

    res.json({ code: 200, message: message, successCount, duplicateCount });
  } catch (error) {
    console.error("批量添加卫衣库存记录失败:", error);
    res.status(500).json({ code: 500, message: "服务器错误" });
  }
}

module.exports = batchAddSweatshirtRecord;

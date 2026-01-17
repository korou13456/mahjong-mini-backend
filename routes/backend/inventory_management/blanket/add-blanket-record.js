// 新增毛毯库存记录
const db = require("../../../../config/database");
const generateBatchHash = require("../../../../utils/generate-batch-hash");

async function addBlanketRecord(req, res) {
  try {
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
    } = req.body;

    if (!record_date) {
      return res.json({
        code: 400,
        message: "记录日期不能为空",
      });
    }

    if (status === undefined || status === null) {
      return res.json({
        code: 400,
        message: "状态不能为空",
      });
    }

    if (![0, 1, 2].includes(status)) {
      return res.json({
        code: 400,
        message: "状态值无效，应为 0(在路上)、1(入库)、2(出库)",
      });
    }

    const batch_hash = generateBatchHash(req.body);

    // 插入明细记录
    await db.query(
      `INSERT INTO blanket_inventory_record
       (record_date, status, size_40_30, size_50_40, size_60_50, size_60_70, size_80_60, remark, image_urls, batch_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record_date,
        status,
        size_40_30,
        size_50_40,
        size_60_50,
        size_60_70,
        size_80_60,
        remark || null,
        image_urls ? JSON.stringify(image_urls) : null,
        batch_hash,
      ]
    );

    // 只有入库(1)和出库(2)才更新总量表，在路上(0)不更新
    if (status === 1 || status === 2) {
      await db.query(
        `UPDATE blanket_inventory SET
         size_40_30 = size_40_30 + ?,
         size_50_40 = size_50_40 + ?,
         size_60_50 = size_60_50 + ?,
         size_60_70 = size_60_70 + ?,
         size_80_60 = size_80_60 + ?,
         updated_at = CURRENT_TIMESTAMP`,
        [size_40_30, size_50_40, size_60_50, size_60_70, size_80_60]
      );
    }

    res.json({
      code: 200,
      message: "添加成功",
    });
  } catch (error) {
    console.error("添加毛毯库存记录失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = addBlanketRecord;

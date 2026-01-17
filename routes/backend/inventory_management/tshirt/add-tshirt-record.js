// 新增T恤库存记录
const db = require("../../../../config/database");
const generateBatchHash = require("../../../../utils/generate-batch-hash");

async function addTshirtRecord(req, res) {
  try {
    const {
      record_date,
      status,
      black_s = 0,
      black_m = 0,
      black_l = 0,
      black_xl = 0,
      black_xxl = 0,
      black_3xl = 0,
      black_4xl = 0,
      black_5xl = 0,
      white_s = 0,
      white_m = 0,
      white_l = 0,
      white_xl = 0,
      white_xxl = 0,
      white_3xl = 0,
      white_4xl = 0,
      white_5xl = 0,
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
      `INSERT INTO tshirt_inventory_record
       (record_date, status, black_s, black_m, black_l, black_xl, black_xxl, black_3xl, black_4xl, black_5xl,
        white_s, white_m, white_l, white_xl, white_xxl, white_3xl, white_4xl, white_5xl, remark, image_urls, batch_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record_date,
        status,
        black_s,
        black_m,
        black_l,
        black_xl,
        black_xxl,
        black_3xl,
        black_4xl,
        black_5xl,
        white_s,
        white_m,
        white_l,
        white_xl,
        white_xxl,
        white_3xl,
        white_4xl,
        white_5xl,
        remark || null,
        image_urls ? JSON.stringify(image_urls) : null,
        batch_hash,
      ]
    );

    // 只有入库(1)和出库(2)才更新总量表，在路上(0)不更新
    if (status === 1 || status === 2) {
      await db.query(
        `UPDATE tshirt_inventory SET
         black_s = black_s + ?,
         black_m = black_m + ?,
         black_l = black_l + ?,
         black_xl = black_xl + ?,
         black_xxl = black_xxl + ?,
         black_3xl = black_3xl + ?,
         black_4xl = black_4xl + ?,
         black_5xl = black_5xl + ?,
         white_s = white_s + ?,
         white_m = white_m + ?,
         white_l = white_l + ?,
         white_xl = white_xl + ?,
         white_xxl = white_xxl + ?,
         white_3xl = white_3xl + ?,
         white_4xl = white_4xl + ?,
         white_5xl = white_5xl + ?,
         updated_at = CURRENT_TIMESTAMP`,
        [
          black_s,
          black_m,
          black_l,
          black_xl,
          black_xxl,
          black_3xl,
          black_4xl,
          black_5xl,
          white_s,
          white_m,
          white_l,
          white_xl,
          white_xxl,
          white_3xl,
          white_4xl,
          white_5xl,
        ]
      );
    }

    res.json({
      code: 200,
      message: "添加成功",
    });
  } catch (error) {
    console.error("添加T恤库存记录失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = addTshirtRecord;

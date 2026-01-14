// 修改卫衣库存记录（仅允许修改状态为0的记录）
const db = require("../../../../config/database");

async function updateSweatshirtRecord(req, res) {
  try {
    const {
      id,
      record_date,
      status,
      black_s = 0, black_m = 0, black_l = 0, black_xl = 0, black_xxl = 0, black_3xl = 0, black_4xl = 0, black_5xl = 0,
      gray_s = 0, gray_m = 0, gray_l = 0, gray_xl = 0, gray_xxl = 0, gray_3xl = 0, gray_4xl = 0, gray_5xl = 0,
      navy_s = 0, navy_m = 0, navy_l = 0, navy_xl = 0, navy_xxl = 0, navy_3xl = 0, navy_4xl = 0, navy_5xl = 0,
      white_s = 0, white_m = 0, white_l = 0, white_xl = 0, white_xxl = 0, white_3xl = 0, white_4xl = 0, white_5xl = 0,
      remark,
      image_urls,
    } = req.body;

    if (!id) {
      return res.json({
        code: 400,
        message: "记录ID不能为空",
      });
    }

    // 查询原记录
    const [existing] = await db.query(
      `SELECT * FROM sweatshirt_inventory_record WHERE id = ?`,
      [id]
    );

    if (existing.length === 0) {
      return res.json({
        code: 404,
        message: "记录不存在",
      });
    }

    const oldRecord = existing[0];

    // 只允许修改状态为0的记录
    if (oldRecord.status !== 0) {
      return res.json({
        code: 403,
        message: "只允许修改状态为在路上（0）的记录",
      });
    }

    // 如果新状态是1或2，需要更新总量表
    if (status === 1 || status === 2) {
      await db.query(
        `UPDATE sweatshirt_inventory SET
         black_s = black_s + ?, black_m = black_m + ?, black_l = black_l + ?, black_xl = black_xl + ?, black_xxl = black_xxl + ?, black_3xl = black_3xl + ?, black_4xl = black_4xl + ?, black_5xl = black_5xl + ?,
         gray_s = gray_s + ?, gray_m = gray_m + ?, gray_l = gray_l + ?, gray_xl = gray_xl + ?, gray_xxl = gray_xxl + ?, gray_3xl = gray_3xl + ?, gray_4xl = gray_4xl + ?, gray_5xl = gray_5xl + ?,
         navy_s = navy_s + ?, navy_m = navy_m + ?, navy_l = navy_l + ?, navy_xl = navy_xl + ?, navy_xxl = navy_xxl + ?, navy_3xl = navy_3xl + ?, navy_4xl = navy_4xl + ?, navy_5xl = navy_5xl + ?,
         white_s = white_s + ?, white_m = white_m + ?, white_l = white_l + ?, white_xl = white_xl + ?, white_xxl = white_xxl + ?, white_3xl = white_3xl + ?, white_4xl = white_4xl + ?, white_5xl = white_5xl + ?,
         updated_at = CURRENT_TIMESTAMP`,
        [
          black_s, black_m, black_l, black_xl, black_xxl, black_3xl, black_4xl, black_5xl,
          gray_s, gray_m, gray_l, gray_xl, gray_xxl, gray_3xl, gray_4xl, gray_5xl,
          navy_s, navy_m, navy_l, navy_xl, navy_xxl, navy_3xl, navy_4xl, navy_5xl,
          white_s, white_m, white_l, white_xl, white_xxl, white_3xl, white_4xl, white_5xl,
        ]
      );
    }

    // 更新明细记录
    await db.query(
      `UPDATE sweatshirt_inventory_record SET
       record_date = ?, status = ?,
       black_s = ?, black_m = ?, black_l = ?, black_xl = ?, black_xxl = ?, black_3xl = ?, black_4xl = ?, black_5xl = ?,
       gray_s = ?, gray_m = ?, gray_l = ?, gray_xl = ?, gray_xxl = ?, gray_3xl = ?, gray_4xl = ?, gray_5xl = ?,
       navy_s = ?, navy_m = ?, navy_l = ?, navy_xl = ?, navy_xxl = ?, navy_3xl = ?, navy_4xl = ?, navy_5xl = ?,
       white_s = ?, white_m = ?, white_l = ?, white_xl = ?, white_xxl = ?, white_3xl = ?, white_4xl = ?, white_5xl = ?,
       remark = ?, image_urls = ?
       WHERE id = ?`,
      [
        record_date,
        status,
        black_s, black_m, black_l, black_xl, black_xxl, black_3xl, black_4xl, black_5xl,
        gray_s, gray_m, gray_l, gray_xl, gray_xxl, gray_3xl, gray_4xl, gray_5xl,
        navy_s, navy_m, navy_l, navy_xl, navy_xxl, navy_3xl, navy_4xl, navy_5xl,
        white_s, white_m, white_l, white_xl, white_xxl, white_3xl, white_4xl, white_5xl,
        remark || null,
        image_urls ? JSON.stringify(image_urls) : null,
        id,
      ]
    );

    res.json({
      code: 200,
      message: "修改成功",
    });
  } catch (error) {
    console.error("修改卫衣库存记录失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = updateSweatshirtRecord;

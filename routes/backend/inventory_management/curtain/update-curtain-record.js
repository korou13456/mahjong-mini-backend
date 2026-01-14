// 修改窗帘库存记录（仅允许修改状态为0的记录）
const db = require("../../../../config/database");

async function updateCurtainRecord(req, res) {
  try {
    const {
      id,
      record_date,
      status,
      size_52_63 = 0,
      size_52_84 = 0,
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
      `SELECT * FROM curtain_inventory_record WHERE id = ?`,
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
        `UPDATE curtain_inventory SET
         size_52_63 = size_52_63 + ?,
         size_52_84 = size_52_84 + ?,
         updated_at = CURRENT_TIMESTAMP`,
        [size_52_63, size_52_84]
      );
    }

    // 更新明细记录
    await db.query(
      `UPDATE curtain_inventory_record SET
       record_date = ?,
       status = ?,
       size_52_63 = ?, size_52_84 = ?,
       remark = ?,
       image_urls = ?
       WHERE id = ?`,
      [
        record_date,
        status,
        size_52_63,
        size_52_84,
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
    console.error("修改窗帘库存记录失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = updateCurtainRecord;

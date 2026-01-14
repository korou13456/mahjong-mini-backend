// 修改地垫库存记录（仅允许修改状态为0的记录）
const db = require("../../../../config/database");

async function updateDoormatRecord(req, res) {
  try {
    const {
      id,
      record_date,
      status,
      size_40_60 = 0,
      size_43_75 = 0,
      size_43_120 = 0,
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
      `SELECT * FROM doormat_inventory_record WHERE id = ?`,
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
        `UPDATE doormat_inventory SET
         size_40_60 = size_40_60 + ?,
         size_43_75 = size_43_75 + ?,
         size_43_120 = size_43_120 + ?,
         updated_at = CURRENT_TIMESTAMP`,
        [size_40_60, size_43_75, size_43_120]
      );
    }

    // 更新明细记录
    await db.query(
      `UPDATE doormat_inventory_record SET
       record_date = ?,
       status = ?,
       size_40_60 = ?, size_43_75 = ?, size_43_120 = ?,
       remark = ?,
       image_urls = ?
       WHERE id = ?`,
      [
        record_date,
        status,
        size_40_60,
        size_43_75,
        size_43_120,
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
    console.error("修改地垫库存记录失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = updateDoormatRecord;

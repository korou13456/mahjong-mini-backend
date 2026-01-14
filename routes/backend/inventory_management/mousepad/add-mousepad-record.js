// 新增鼠标垫库存记录
const db = require("../../../../config/database");

async function addMousepadRecord(req, res) {
  try {
    const {
      record_date,
      status,
      size_30_80 = 0,
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

    // 插入明细记录
    await db.query(
      `INSERT INTO mousepad_inventory_record
       (record_date, status, size_30_80, remark, image_urls)
       VALUES (?, ?, ?, ?, ?)`,
      [
        record_date,
        status,
        size_30_80,
        remark || null,
        image_urls ? JSON.stringify(image_urls) : null,
      ]
    );

    // 只有入库(1)和出库(2)才更新总量表，在路上(0)不更新
    if (status === 1 || status === 2) {
      await db.query(
        `UPDATE mousepad_inventory SET
         size_30_80 = size_30_80 + ?,
         updated_at = CURRENT_TIMESTAMP`,
        [size_30_80]
      );
    }

    res.json({
      code: 200,
      message: "添加成功",
    });
  } catch (error) {
    console.error("添加鼠标垫库存记录失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = addMousepadRecord;

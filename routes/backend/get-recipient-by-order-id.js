// 根据订单ID查询订单信息
const db = require("../../config/database");

async function getRecipientByOrderId(req, res) {
  try {
    const { order_id } = req.query;

    if (!order_id) {
      return res.status(400).json({
        code: 400,
        message: "order_id 不能为空",
      });
    }

    // 查询该订单ID下的所有订单商品信息
    const [results] = await db.query(
      `SELECT
        id,
        order_id,
        recipient_name,
        order_item_id,
        category,
        variation,
        quantity,
        price,
        department,
        staff_name,
        status,
        purchase_date_america,
        purchase_date_china,
        created_at,
        updated_at
       FROM order_product_record
       WHERE order_id = ?
       ORDER BY id`,
      [order_id]
    );

    res.json({
      code: 200,
      message: "查询成功",
      data: results,
    });
  } catch (error) {
    console.error("查询订单信息失败:", error);
    res.status(500).json({
      code: 500,
      message: "服务器错误",
    });
  }
}

module.exports = getRecipientByOrderId;

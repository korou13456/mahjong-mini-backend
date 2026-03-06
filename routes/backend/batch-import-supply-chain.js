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

    // 准备批量插入的数据
    const values = data.map((item) => [
      item.transaction_no,
      (item.logistics_method || '').substring(0, 50),
      item.tracking_no,
      item.shipped_at || null,
      item.business_no,
      item.sales_platform,
      item.store_name,
      item.order_amount,
      item.goods_amount,
      item.handling_fee,
      item.shipping_fee,
      item.product_id,
      item.product_name,
      item.size,
      item.quantity,
    ]);

    const sql = `
      INSERT INTO supply_chain_detail (
        transaction_no,
        logistics_method,
        tracking_no,
        shipped_at,
        business_no,
        sales_platform,
        store_name,
        order_amount,
        goods_amount,
        handling_fee,
        shipping_fee,
        product_id,
        product_name,
        size,
        quantity
      ) VALUES ?
      ON DUPLICATE KEY UPDATE
        logistics_method = VALUES(logistics_method),
        tracking_no = VALUES(tracking_no),
        shipped_at = VALUES(shipped_at),
        business_no = VALUES(business_no),
        sales_platform = VALUES(sales_platform),
        store_name = VALUES(store_name),
        order_amount = VALUES(order_amount),
        goods_amount = VALUES(goods_amount),
        handling_fee = VALUES(handling_fee),
        shipping_fee = VALUES(shipping_fee),
        product_id = VALUES(product_id),
        product_name = VALUES(product_name),
        size = VALUES(size),
        quantity = VALUES(quantity)
    `;

    const [result] = await db.query(sql, [values]);

    // 找出未成功插入的记录（可能是重复或失败）
    const existingTransactions = result.insertId ? [] : [];
    let successTransactions = [];
    let failedTransactions = [];

    // 检查哪些记录未成功插入
    if (data.length > 0) {
      const transactionNos = data.map(item => item.transaction_no);
      const [existing] = await db.query(
        'SELECT transaction_no FROM supply_chain_detail WHERE transaction_no IN (?)',
        [transactionNos]
      );
      const existingSet = new Set(existing.map(row => row.transaction_no));
      
      data.forEach(item => {
        if (existingSet.has(item.transaction_no)) {
          successTransactions.push(item.transaction_no);
        } else {
          failedTransactions.push({
            ...item,
            reason: '插入失败'
          });
        }
      });
    }

    res.json({
      code: 200,
      message: "批量导入完成",
      data: {
        total: data.length,
        affectedRows: result.affectedRows,
        insertedCount: result.affectedRows - result.changedRows,
        updatedCount: result.changedRows,
        successTransactions,
        failedTransactions
      },
    });
  } catch (error) {
    console.error("批量导入供应链明细失败:", error);
    res.status(500).json({
      code: 500,
      message: "批量导入失败",
      error: error.message,
    });
  }
};

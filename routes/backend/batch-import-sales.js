// 批量导入销售报表数据（高性能版）
const express = require('express');
const router = express.Router();
const db = require('../../config/database');

async function batchImportSales(req, res) {
  let connection;

  try {
    const { data } = req.body;

    /** 1️⃣ 参数校验 */
    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        code: 400,
        message: '数据不能为空，且必须是数组'
      });
    }

    /** 2️⃣ 构造批量数据 */
    const values = [];

    for (const item of data) {
      const {
        reportDate,
        category,
        specification,
        department,
        staffName,
        orderNo,
        orderItemId,
        salesVolume,
        salesAmount,
        shippingCost,
        platformSubsidy,
        returnLoss
      } = item;

      // 核心唯一键不能为空
      if (!orderItemId) continue;

      values.push([
        reportDate,
        category || '',
        specification || '',
        department || '',
        staffName || '',
        orderNo || '',
        orderItemId,
        Number(salesVolume) || 0,
        Number(salesAmount) || 0,
        Number(shippingCost) || 0,
        Number(platformSubsidy) || 0,
        Number(returnLoss) || 0
      ]);
    }

    if (values.length === 0) {
      return res.json({
        code: 200,
        message: '无有效数据可导入',
        data: { total: 0 }
      });
    }

    /** 3️⃣ 获取连接 & 开事务 */
    connection = await db.getConnection();
    await connection.beginTransaction();

    /** 4️⃣ 一条 SQL 批量插入 / 更新 */
    const sql = `
      INSERT INTO sales_report
      (
        report_date,
        category,
        specification,
        department,
        staff_name,
        order_no,
        order_item_id,
        sales_volume,
        sales_amount,
        shipping_cost,
        platform_subsidy,
        return_loss
      )
      VALUES ?
      ON DUPLICATE KEY UPDATE
        report_date = VALUES(report_date),
        category = VALUES(category),
        specification = VALUES(specification),
        department = VALUES(department),
        staff_name = VALUES(staff_name),
        order_no = VALUES(order_no),
        sales_volume = VALUES(sales_volume),
        sales_amount = VALUES(sales_amount),
        shipping_cost = VALUES(shipping_cost),
        platform_subsidy = VALUES(platform_subsidy),
        return_loss = VALUES(return_loss),
        updated_at = CURRENT_TIMESTAMP
    `;

    await connection.query(sql, [values]);

    /** 5️⃣ 提交 */
    await connection.commit();

    res.json({
      code: 200,
      message: '导入成功',
      data: {
        total: values.length
      }
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('批量导入失败:', error);
    res.status(500).json({
      code: 500,
      message: '服务器错误: ' + error.message
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

module.exports = batchImportSales;

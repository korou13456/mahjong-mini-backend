// 批量导入销售报表数据
const express = require('express');
const router = express.Router();
const { backendAuth } = require('../../middleware/backend-auth');
const db = require('../../config/database');

async function batchImportSales(req, res) {
  let connection;
  try {
    const { data } = req.body;

    // 参数校验
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({
        code: 400,
        message: '数据不能为空，且必须是数组格式'
      });
    }

    // 获取数据库连接
    connection = await db.getConnection();

    await connection.beginTransaction();

    // 逐条处理，先检查是否存在，存在则更新，不存在则插入
    for (const item of data) {
      const {
        reportDate,
        category,
        specification,
        department,
        staffName,
        orderNo,
        salesVolume,
        salesAmount,
        shippingCost,
        platformSubsidy,
        returnLoss
      } = item;

      // 检查订单号是否已存在
      const [existing] = await connection.query(
        'SELECT id FROM sales_report WHERE order_no = ? LIMIT 1',
        [orderNo]
      );

      if (existing.length > 0) {
        // 更新已存在的记录
        await connection.query(
          `UPDATE sales_report SET
           report_date = ?,
           category = ?,
           specification = ?,
           department = ?,
           staff_name = ?,
           sales_volume = ?,
           sales_amount = ?,
           shipping_cost = ?,
           platform_subsidy = ?,
           return_loss = ?,
           updated_at = CURRENT_TIMESTAMP
           WHERE order_no = ?`,
          [
            reportDate, category, specification, department, staffName,
            salesVolume || 0, salesAmount || 0, shippingCost || 0,
            platformSubsidy || 0, returnLoss || 0,
            orderNo
          ]
        );
      } else {
        // 插入新记录
        await connection.query(
          `INSERT INTO sales_report
           (report_date, category, specification, department, staff_name, order_no,
            sales_volume, sales_amount, shipping_cost, platform_subsidy, return_loss)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            reportDate, category, specification, department, staffName, orderNo,
            salesVolume || 0, salesAmount || 0, shippingCost || 0,
            platformSubsidy || 0, returnLoss || 0
          ]
        );
      }
    }

    await connection.commit();

    res.json({
      code: 200,
      message: '导入成功',
      data: {
        total: data.length
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

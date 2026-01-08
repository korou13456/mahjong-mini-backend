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

    // 批量查询已存在的订单号
    const orderNos = data.map(item => item.orderNo).filter(orderNo => orderNo);
    if (orderNos.length > 0) {
      const [existingOrders] = await connection.query(
        'SELECT id, order_no FROM sales_report WHERE order_no IN (?)',
        [orderNos]
      );
      
      const existingOrderMap = new Map();
      existingOrders.forEach(row => {
        existingOrderMap.set(row.order_no, row.id);
      });

      // 分离需要更新和插入的数据
      const updates = [];
      const inserts = [];

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

        if (orderNo && existingOrderMap.has(orderNo)) {
          // 需要更新
          updates.push([
            reportDate, category, specification, department, staffName,
            salesVolume || 0, salesAmount || 0, shippingCost || 0,
            platformSubsidy || 0, returnLoss || 0,
            orderNo
          ]);
        } else {
          // 需要插入
          inserts.push([
            reportDate, category, specification, department, staffName, orderNo,
            salesVolume || 0, salesAmount || 0, shippingCost || 0,
            platformSubsidy || 0, returnLoss || 0
          ]);
        }
      }

      // 批量更新
      if (updates.length > 0) {
        for (const updateData of updates) {
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
            updateData
          );
        }
      }

      // 批量插入
      if (inserts.length > 0) {
        await connection.query(
          `INSERT INTO sales_report
             (report_date, category, specification, department, staff_name, order_no,
              sales_volume, sales_amount, shipping_cost, platform_subsidy, return_loss)
             VALUES ?`,
          [inserts]
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

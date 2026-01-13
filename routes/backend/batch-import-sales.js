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
    const orderItemIds = data.map(item => item.orderItemId).filter(orderItemId => orderItemId);
    if (orderItemIds.length > 0) {
      const [existingOrders] = await connection.query(
        'SELECT id, order_item_id FROM sales_report WHERE order_item_id IN (?)',
        [orderItemIds]
      );

      const existingOrderMap = new Map();
      existingOrders.forEach(row => {
        existingOrderMap.set(row.order_item_id, row.id);
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
          orderItemId,
          salesVolume,
          salesAmount,
          shippingCost,
          platformSubsidy,
          returnLoss
        } = item;

        if (orderItemId && existingOrderMap.has(orderItemId)) {
          // 需要更新
          updates.push([
            reportDate, category, specification, department, staffName, orderNo, orderItemId,
            salesVolume || 0, salesAmount || 0, shippingCost || 0,
            platformSubsidy || 0, returnLoss || 0,
            orderItemId
          ]);
        } else {
          // 需要插入
          inserts.push([
            reportDate, category, specification, department, staffName, orderNo, orderItemId,
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
               order_no = ?,
               order_item_id = ?,
               sales_volume = ?,
               sales_amount = ?,
               shipping_cost = ?,
               platform_subsidy = ?,
               return_loss = ?,
               updated_at = CURRENT_TIMESTAMP
               WHERE order_item_id = ?`,
            updateData
          );
        }
      }

      // 批量插入
      if (inserts.length > 0) {
        await connection.query(
          `INSERT INTO sales_report
             (report_date, category, specification, department, staff_name, order_no, order_item_id,
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

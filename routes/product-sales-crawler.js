const express = require("express");
const router = express.Router();
const { crawlProductSales } = require("../scripts/product-sales-crawler/index.js");

let crawlTask = {
  isRunning: false,
  shouldStop: false,
  total: 0,
  processed: 0,
  success: 0,
  error: 0,
  logs: [],
};

// 存储日志
function addLog(message, type = "info") {
  const log = {
    message,
    type,
    timestamp: new Date().toISOString(),
  };
  crawlTask.logs.push(log);
  // 只保留最近100条日志
  if (crawlTask.logs.length > 100) {
    crawlTask.logs.shift();
  }
}

// 重写console方法来捕获日志
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function setupLogCapture() {
  console.log = (...args) => {
    const message = args.join(" ");
    originalLog(...args);
    addLog(message, "info");
  };

  console.error = (...args) => {
    const message = args.join(" ");
    originalError(...args);
    addLog(message, "error");
  };

  console.warn = (...args) => {
    const message = args.join(" ");
    originalWarn(...args);
    addLog(message, "warning");
  };
}

function restoreLog() {
  console.log = originalLog;
  console.error = originalError;
  console.warn = originalWarn;
}

// 启动爬取任务
router.post("/start", async (req, res) => {
  try {
    if (crawlTask.isRunning) {
      return res.json({ success: false, message: "任务已在运行中" });
    }

    const { startIndex = 0 } = req.body;

    crawlTask.isRunning = true;
    crawlTask.shouldStop = false;
    crawlTask.processed = 0;
    crawlTask.success = 0;
    crawlTask.error = 0;
    crawlTask.logs = [];

    setupLogCapture();

    addLog(`开始爬取任务，从第 ${startIndex} 个商品开始`, "info");

    // 获取商品总数
    const db = require("../config/database");
    const [rows] = await db.query(
      `SELECT COUNT(*) as total FROM product WHERE status = 1`
    );
    crawlTask.total = rows[0]?.total || 0;

    // 异步执行爬取
    runCrawlTask(startIndex);

    res.json({
      success: true,
      message: "爬取任务已启动",
      totalProducts: crawlTask.total,
    });
  } catch (error) {
    console.error("启动爬取任务失败:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 停止爬取任务
router.post("/stop", async (req, res) => {
  try {
    if (!crawlTask.isRunning) {
      return res.json({ success: false, message: "没有正在运行的任务" });
    }

    crawlTask.shouldStop = true;
    addLog("收到停止指令，正在停止...", "warning");

    res.json({ success: true, message: "正在停止任务" });
  } catch (error) {
    console.error("停止爬取任务失败:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 获取爬取状态
router.get("/status", (req, res) => {
  res.json({
    isRunning: crawlTask.isRunning,
    status: {
      total: crawlTask.total,
      processed: crawlTask.processed,
      success: crawlTask.success,
      error: crawlTask.error,
    },
    logs: crawlTask.logs,
    finished: !crawlTask.isRunning && crawlTask.processed > 0,
  });
});

// 异步执行爬取任务
async function runCrawlTask(startIndex) {
  const db = require("../config/database");

  try {
    addLog(`开始获取商品销量数据...`, "info");

    // 获取所有商品
    const [products] = await db.query(
      `SELECT id, shop_id, product_id, title FROM product WHERE status = 1`
    );

    if (products.length === 0) {
      addLog("没有需要处理的商品", "warning");
      finishTask();
      return;
    }

    addLog(`找到 ${products.length} 个商品，从第 ${startIndex} 个开始处理`, "info");

    const axios = require("axios");
    const API_URL = "https://api.temaishuju.com/api/v1/goods/card";
    const REGION = "211";

    for (let i = startIndex; i < products.length; i++) {
      if (crawlTask.shouldStop) {
        addLog("任务已手动停止", "warning");
        break;
      }

      const product = products[i];
      crawlTask.processed = i - startIndex + 1;

      try {
        addLog(
          `[${crawlTask.processed}/${products.length}] 处理商品: ${product.title} (ID: ${product.product_id})`,
          "info"
        );

        const url = `${API_URL}?goodsId=${product.product_id}&mallId=${product.shop_id}&region=${REGION}`;
        const response = await axios.get(url, {
          headers: {
            Accept: "*/*",
            "Accept-Encoding": "gzip, deflate, br",
            Connection: "keep-alive",
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36",
          },
        });

        // 检测反爬JS
        if (
          typeof response.data === "string" &&
          response.data.startsWith("<script")
        ) {
          addLog(`商品 ${product.product_id} 接口返回反爬JS，跳过`, "warning");
          crawlTask.error++;
          await sleep(2000);
          continue;
        }

        const result = response.data;

        if (result.code !== 0 || !result.data?.history) {
          addLog(`商品 ${product.product_id} 无销量历史数据`, "warning");
          crawlTask.error++;
          await sleep(2000);
          continue;
        }

        // 映射销量数据
        const salesData = result.data.history.map((item) => {
          const createDate = new Date(item.createTime);
          const orderDate = createDate.toISOString().split("T")[0];
          return {
            product_id: product.id,
            order_date: orderDate,
            order_count: item.daySold || 0,
          };
        });

        // 过滤最近7天
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 6);
        const startDateStr = startDate.toISOString().split("T")[0];
        const endDateStr = endDate.toISOString().split("T")[0];

        const recentSalesData = salesData.filter(
          (item) =>
            item.order_date >= startDateStr && item.order_date <= endDateStr
        );

        if (recentSalesData.length === 0) {
          addLog(`商品 ${product.product_id} 最近7天无销量数据`, "warning");
          await sleep(2000);
          continue;
        }

        // 插入数据库
        const values = recentSalesData.map((item) => [
          item.product_id,
          item.order_date,
          item.order_count,
        ]);

        await db.query(
          `INSERT INTO product_sales_daily (product_id, order_date, order_count)
           VALUES ?
           ON DUPLICATE KEY UPDATE
             order_count = VALUES(order_count)`,
          [values]
        );

        addLog(
          `商品 ${product.product_id} 处理完成，插入了 ${recentSalesData.length} 条数据`,
          "success"
        );
        crawlTask.success++;

        // 延迟
        await sleep(2000);
      } catch (error) {
        addLog(`处理商品 ${product.product_id} 失败: ${error.message}`, "error");
        crawlTask.error++;
      }
    }

    addLog(
      `爬取完成！总共处理 ${products.length} 个商品，成功 ${crawlTask.success} 个，失败 ${crawlTask.error} 个`,
      "success"
    );

    finishTask();
  } catch (error) {
    addLog(`爬取任务执行失败: ${error.message}`, "error");
    finishTask();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function finishTask() {
  crawlTask.isRunning = false;
  restoreLog();
}

module.exports = router;

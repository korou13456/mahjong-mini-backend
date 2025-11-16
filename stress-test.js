class StressTester {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 30; // 并发数
    this.requestsPerSecond = options.requestsPerSecond || 100; // 每秒请求数改为100
    this.duration = options.duration || 60; // 测试时长(秒)改为60秒
    this.url =
      options.url || "https://majhongapp.cn/api/mahjong/get-table-list";
    this.headers = options.headers || {
      Connection: "keep-alive",
      Authorization:
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjY0ODQ0ODczOTg2MSwidW5pb25pZCI6Im94bDNZNnhpRDJTWWFzaWpBeHlpbENDa0JqRE0iLCJ3eGlkIjoib2toOV8xelR3YXlQakQ0alpwaUJ1dmFmQlNJcyIsImlkIjoxLCJpYXQiOjE3NjMxMzExOTUsImV4cCI6MTc2MzczNTk5NX0.C5US3gLUt4wH_gE8Fsj0349EN48PDq4wbVKxzkkekfE",
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1 wechatdevtools/1.06.2504060 MicroMessenger/8.0.5 Language/zh_CN webview/ sessionid/454",
      "content-type": "application/json",
      Accept: "*/*",
      "Sec-Fetch-Site": "cross-site",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Dest": "empty",
      Referer:
        "https://servicewechat.com/wx0c96cbb1c0b0e690/devtools/page-frame.html",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "If-None-Match": 'W/"38-pnmLqKI9SSGSSFtsALiAp0CVPGs"',
    };

    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalResponseTime: 0,
      startTime: null,
      endTime: null,
    };

    this.responses = [];
    this.isRunning = false;
  }

  async makeRequest() {
    const startTime = Date.now();

    try {
      const response = await fetch(this.url, {
        method: "GET",
        headers: this.headers,
      });

      const responseTime = Date.now() - startTime;
      const success = response.ok;

      return {
        success,
        status: response.status,
        responseTime,
        timestamp: startTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        success: false,
        status: 0,
        responseTime,
        error: error.message,
        timestamp: startTime,
      };
    }
  }

  async runConcurrentBatch() {
    const promises = [];
    for (let i = 0; i < this.concurrency; i++) {
      promises.push(this.makeRequest());
    }
    return Promise.all(promises);
  }

  updateStats(results) {
    results.forEach((result) => {
      this.stats.totalRequests++;

      if (result.success) {
        this.stats.successfulRequests++;
      } else {
        this.stats.failedRequests++;
      }

      this.stats.totalResponseTime += result.responseTime;
      this.responses.push(result);
    });
  }

  printProgress() {
    const elapsed = Math.floor((Date.now() - this.stats.startTime) / 1000);
    const rps = this.stats.totalRequests / elapsed;
    const avgResponseTime =
      this.stats.totalResponseTime / this.stats.totalRequests;

    console.log(
      `[${new Date().toISOString()}] 运行时间: ${elapsed}s | 总请求: ${
        this.stats.totalRequests
      } | 成功: ${this.stats.successfulRequests} | 失败: ${
        this.stats.failedRequests
      } | RPS: ${rps.toFixed(2)} | 平均响应: ${avgResponseTime.toFixed(2)}ms`
    );
  }

  async run() {
    console.log("🚀 开始压力测试...");
    console.log(
      `📊 配置: ${this.concurrency}并发, 目标${this.requestsPerSecond}RPS, 持续${this.duration}秒`
    );

    this.stats.startTime = Date.now();
    this.stats.endTime = this.stats.startTime + this.duration * 1000;
    this.isRunning = true;

    const interval = 1000 / this.requestsPerSecond;
    let batchCount = 0;

    const intervalId = setInterval(() => {
      this.printProgress();
    }, 1000);

    try {
      while (Date.now() < this.stats.endTime && this.isRunning) {
        const batchStart = Date.now();

        try {
          const results = await this.runConcurrentBatch();
          this.updateStats(results);
          batchCount++;
        } catch (error) {
          console.error("批量请求失败:", error);
        }

        // 控制请求频率
        const batchTime = Date.now() - batchStart;
        const waitTime = Math.max(0, interval - batchTime);

        if (waitTime > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    } finally {
      clearInterval(intervalId);
      this.printFinalReport();
    }
  }

  stop() {
    this.isRunning = false;
    console.log("⏹️ 测试已停止");
  }

  printFinalReport() {
    console.log("\n📈 ========== 压力测试报告 ==========");
    console.log(`⏱️  总运行时间: ${this.duration}秒`);
    console.log(`📊 总请求数: ${this.stats.totalRequests}`);
    console.log(`✅ 成功请求: ${this.stats.successfulRequests}`);
    console.log(`❌ 失败请求: ${this.stats.failedRequests}`);
    console.log(
      `🎯 成功率: ${(
        (this.stats.successfulRequests / this.stats.totalRequests) *
        100
      ).toFixed(2)}%`
    );

    const rps = this.stats.totalRequests / this.duration;
    console.log(`🚀 平均RPS: ${rps.toFixed(2)}`);

    if (this.stats.totalRequests > 0) {
      const avgResponseTime =
        this.stats.totalResponseTime / this.stats.totalRequests;
      console.log(`⏳ 平均响应时间: ${avgResponseTime.toFixed(2)}ms`);

      // 计算响应时间分布
      const responseTimes = this.responses.map((r) => r.responseTime);
      const sortedTimes = responseTimes.sort((a, b) => a - b);
      const p95 = sortedTimes[Math.floor(sortedTimes.length * 0.95)];
      const p99 = sortedTimes[Math.floor(sortedTimes.length * 0.99)];

      console.log(`📊 95%响应时间: ${p95.toFixed(2)}ms`);
      console.log(`📊 99%响应时间: ${p99.toFixed(2)}ms`);

      // 状态码统计
      const statusCounts = {};
      this.responses.forEach((r) => {
        if (r.status !== undefined) {
          statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
        }
      });

      console.log("🔢 状态码分布:");
      Object.keys(statusCounts).forEach((status) => {
        console.log(`  ${status}: ${statusCounts[status]}次`);
      });
    }
  }
}

// 使用更激进的配置进行测试
const aggressiveTester = new StressTester({
  concurrency: 80, // 并发数
  requestsPerSecond: 120, // 每秒请求数100
  duration: 60, // 测试时长60秒(1分钟)
});

// 开始测试
aggressiveTester.run().catch(console.error);

// 如果需要停止测试，可以调用 aggressiveTester.stop()

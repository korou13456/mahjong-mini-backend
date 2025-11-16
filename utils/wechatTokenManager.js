// utils/wechatTokenManager.js
const axios = require("axios");

class WechatTokenManager {
  constructor() {
    this.cachedToken = null;
    this.tokenExpireTime = 0;
    this.isRefreshing = false;
    this.refreshQueue = [];
  }

  /**
   * 获取access_token（带缓存机制）
   * @returns {Promise<string>} access_token
   */
  async getAccessToken() {
    const now = Date.now();

    // 如果token存在且未过期，直接返回
    if (this.cachedToken && now < this.tokenExpireTime) {
      return this.cachedToken;
    }

    // 如果正在刷新，加入队列等待
    if (this.isRefreshing) {
      console.log("⏳ access_token 正在刷新，等待中...");
      return new Promise((resolve, reject) => {
        this.refreshQueue.push({ resolve, reject });
      });
    }

    // 开始刷新token
    this.isRefreshing = true;
    try {
      const appId = process.env.WX_APP_ID;
      const appSecret = process.env.WX_APP_SECRET;

      if (!appId || !appSecret) {
        throw new Error("微信配置缺失: WX_APP_ID 或 WX_APP_SECRET 未设置");
      }

      const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
      const res = await axios.get(url);

      if (!res.data.access_token) {
        throw new Error(`获取access_token失败: ${JSON.stringify(res.data)}`);
      }

      // 缓存token，提前5分钟过期，确保安全
      this.cachedToken = res.data.access_token;
      this.tokenExpireTime = now + (res.data.expires_in - 300) * 1000;

      console.log(
        `✅ 微信access_token刷新成功，有效期至: ${new Date(
          this.tokenExpireTime
        ).toLocaleString()}`
      );

      // 处理等待队列
      this.refreshQueue.forEach(({ resolve }) => resolve(this.cachedToken));
      this.refreshQueue = [];

      return this.cachedToken;
    } catch (error) {
      // 处理等待队列错误
      this.refreshQueue.forEach(({ reject }) => reject(error));
      this.refreshQueue = [];

      console.error("❌ 获取微信access_token失败:", error.message);
      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * 强制刷新access_token
   * @returns {Promise<string>} 新的access_token
   */
  async refreshAccessToken() {
    this.cachedToken = null;
    this.tokenExpireTime = 0;
    return this.getAccessToken();
  }

  /**
   * 获取token状态
   * @returns {Object} token状态信息
   */
  getTokenStatus() {
    const now = Date.now();
    const isExpired = now >= this.tokenExpireTime;
    const remainingTime = isExpired ? 0 : this.tokenExpireTime - now;

    return {
      hasToken: !!this.cachedToken,
      isExpired,
      remainingTime: Math.floor(remainingTime / 1000), // 剩余秒数
      expiresAt: new Date(this.tokenExpireTime).toLocaleString(),
      isRefreshing: this.isRefreshing,
    };
  }
}

// 创建单例实例
const tokenManager = new WechatTokenManager();

module.exports = tokenManager;

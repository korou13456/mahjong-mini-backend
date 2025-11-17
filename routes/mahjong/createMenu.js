// routes/mahjong/wechat/createMenu.js
const axios = require("axios");
const tokenManager = require("../../utils/wechatTokenManager");

// 创建自定义菜单的方法
async function createMenu(req, res) {
  try {
    // 1. 获取 access_token（使用缓存机制）
    const accessToken = await tokenManager.getAccessToken();

    // 2. 自定义菜单数据
    const menuData = {
      button: [
        {
          type: "miniprogram",
          name: "进入小程序",
          url: "https://mp.weixin.qq.com",
          appid: process.env.WECHAT_APPID, // 你的小程序 AppID
          pagepath: "pages/home-page/index",
        },
      ],
    };

    // 3. 推送创建菜单请求
    const createRes = await axios.post(
      `https://api.weixin.qq.com/cgi-bin/menu/create?access_token=${accessToken}`,
      menuData
    );

    return res.json({
      code: 200,
      msg: "创建自定义菜单完成",
      data: createRes.data,
    });
  } catch (error) {
    return res.json({
      code: -1,
      msg: "创建菜单异常",
      error: error.message,
    });
  }
}

module.exports = createMenu;

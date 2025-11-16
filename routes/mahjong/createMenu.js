// routes/mahjong/wechat/createMenu.js
const axios = require("axios");

// 你的公众号 APPID 和 APPSECRET
const APPID = process.env.WX_APP_ID;
const APPSECRET = process.env.WX_APP_SECRET;

// 创建自定义菜单的方法
async function createMenu(req, res) {
  try {
    console.log(APPID, APPSECRET, "!====>>");
    // 1. 获取 access_token
    const tokenRes = await axios.get(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${APPID}&secret=${APPSECRET}`
    );

    if (!tokenRes.data.access_token) {
      return res.json({
        code: -1,
        msg: "获取 access_token 失败",
        data: tokenRes.data,
      });
    }

    const accessToken = tokenRes.data.access_token;

    // 2. 自定义菜单数据
    const menuData = {
      button: [
        {
          type: "miniprogram",
          name: "进入小程序",
          url: "https://mp.weixin.qq.com",
          appid: process.env.WECHAT_APPID, // 你的小程序 AppID
          pagepath: "pages/index/index",
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

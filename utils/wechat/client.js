// utils/wechat/client.js
const axios = require("axios");
const tokenManager = require("../wechatTokenManager");

async function getAccessToken() {
  return await tokenManager.getAccessToken();
}

async function sendTemplateMessage({
  openid,
  template_id,
  url = "",
  data,
  miniprogram = null,
}) {
  const token = await getAccessToken();

  const payload = {
    touser: openid,
    template_id,
    data,
  };

  if (miniprogram) {
    payload.miniprogram = miniprogram;
  }

  if (url) {
    payload.url = url;
  }

  const res = await axios.post(
    `https://api.weixin.qq.com/cgi-bin/message/template/send?access_token=${token}`,
    payload
  );

  if (res.data.errcode !== 0) {
    console.error("推送失败:", res.data);
  } else {
    console.log(`推送成功 to ${openid}`);
  }

  return res.data;
}

module.exports = { getAccessToken, sendTemplateMessage };

// routes/mahjong/wechat.js
const {
  buildSignature,
  buildMsgSignature,
  aesDecrypt,
  aesEncrypt,
} = require("../../utils/wechatVerify");
const axios = require("axios");
const xml2js = require("xml2js");
const db = require("../../config/database");

/**
 * 读取原始文本请求体（兼容未经过 body-parser 的 text/xml）
 */
async function readRawText(req) {
  if (req.rawBody) return req.rawBody.toString("utf8");
  if (typeof req.body === "string") return req.body;
  // 没有解析器时，手动读取
  return await new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * 微信服务号服务器配置验证（GET）
 */
async function wechatVerify(req, res) {
  const { signature, timestamp, nonce, echostr } = req.query || {};
  const token = process.env.WECHAT_TOKEN || "";
  if (!token) {
    return res.status(500).send("WECHAT_TOKEN 未配置，无法完成服务器校验");
  }
  const expect = buildSignature(token, timestamp || "", nonce || "");
  if (expect === signature) {
    return res.status(200).send(echostr || "");
  }
  return res.status(401).send("signature 校验失败");
}

let cachedAccessToken = null;
let tokenExpireTime = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpireTime) {
    return cachedAccessToken;
  }
  const appId = process.env.WX_APP_ID;
  const appSecret = process.env.WX_APP_SECRET;
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
  const res = await axios.get(url);
  if (res.data.access_token) {
    cachedAccessToken = res.data.access_token;
    tokenExpireTime = now + (res.data.expires_in - 300) * 1000; // 提前5分钟刷新
    return cachedAccessToken;
  }
  throw new Error("获取access_token失败：" + JSON.stringify(res.data));
}

async function getUserInfo(accessToken, openid) {
  const url = `https://api.weixin.qq.com/cgi-bin/user/info?access_token=${accessToken}&openid=${openid}&lang=zh_CN`;
  const res = await axios.get(url);
  if (res.data.errcode) {
    throw new Error(`微信接口返回错误: ${res.data.errmsg}`);
  }
  return res.data;
}

/**
 * 读取原始文本请求体（兼容未经过 body-parser 的 text/xml）
 */
async function readRawText(req) {
  if (req.rawBody) return req.rawBody.toString("utf8");
  if (typeof req.body === "string") return req.body;
  return await new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * 微信服务号消息接收（POST）
 */
async function wechatReceive(req, res) {
  try {
    console.log("服务号消息开始");
    const { timestamp = "", nonce = "", msg_signature = "" } = req.query || {};
    const token = process.env.WECHAT_TOKEN || "";
    const encodingAesKey = process.env.WECHAT_ENCODING_AES_KEY || "";
    const appId = process.env.WX_APP_ID || "";

    const raw = await readRawText(req);

    const encryptMatch =
      raw.match(/<Encrypt><!\[CDATA\[(.*)\]\]><\/Encrypt>/) ||
      raw.match(/<Encrypt>([^<]+)<\/Encrypt>/);
    if (!encryptMatch) {
      return res.status(200).send("success");
    }

    const encrypt = encryptMatch[1] || "";
    if (!token || !encodingAesKey || !appId) {
      return res
        .status(500)
        .send("WECHAT_TOKEN / WECHAT_ENCODING_AES_KEY / WX_APP_ID 未配置");
    }
    const expectMsgSig = buildMsgSignature(token, timestamp, nonce, encrypt);
    if (expectMsgSig !== msg_signature) {
      return res.status(401).send("msg_signature 校验失败");
    }

    const { msg: decryptedXml, appId: xmlAppId } = aesDecrypt(
      encrypt,
      encodingAesKey
    );
    if (xmlAppId !== appId) {
      return res.status(401).send("AppId 不匹配");
    }

    // 解析 XML
    const parsed = await xml2js.parseStringPromise(decryptedXml, {
      explicitArray: false,
      trim: true,
    });

    const msg = parsed.xml || {};
    if (msg.MsgType === "event" && msg.Event === "subscribe") {
      const openid = msg.FromUserName;

      try {
        const accessToken = await getAccessToken();
        const userInfo = await getUserInfo(accessToken, openid);

        // 根据 unionid 处理用户与服务号 openid 的绑定
        const unionid = userInfo.unionid;
        if (unionid) {
          const connection = await db.getConnection();
          try {
            await connection.beginTransaction();
            const [rows] = await connection.execute(
              "SELECT id FROM users WHERE unionid = ? LIMIT 1",
              [unionid]
            );
            if (rows.length > 0) {
              // 已存在用户，更新其服务号 openid
              await connection.execute(
                "UPDATE users SET service_openid = ?, is_subscribed = 1 WHERE id = ?",
                [openid, rows[0].id]
              );
            } else {
              // 不存在则创建仅包含 unionid 与 service_openid 的记录
              await connection.execute(
                `INSERT INTO users (unionid, service_openid, status, user_type, is_subscribed, total_game_cnt, total_game_create)
                 VALUES (?, ?, 0, 0, 1, 0, 0)`,
                [unionid, openid]
              );
            }
            await connection.commit();
          } catch (dbErr) {
            console.error("处理用户unionid/openid写库失败:", dbErr);
            try {
              await connection.rollback();
            } catch (_) {}
          } finally {
            try {
              connection.release();
            } catch (_) {}
          }
        } else {
          console.warn("该关注用户未返回unionid，跳过用户绑定处理");
        }
      } catch (err) {
        console.error("获取用户信息失败:", err);
      }

      // 关注回复图文消息
      const title = "桌友们都在等你～";
      const description = `关注成功啦！🎲
         以后拼桌成功、好友邀局、活动更新，我们都会第一时间告诉你。
         别错过每一局好玩的人！`;
      const picUrl =
        "https://majhongapp.cn/uploads/1763274689590-13b5a5b2b8f57.png"; // 你的小卡片图片地址

      const replyXml = `
        <xml>
          <ToUserName><![CDATA[${msg.FromUserName}]]></ToUserName>
          <FromUserName><![CDATA[${msg.ToUserName}]]></FromUserName>
          <CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
          <MsgType><![CDATA[news]]></MsgType>
          <ArticleCount>1</ArticleCount>
          <Articles>
            <item>
              <Title><![CDATA[${title}]]></Title>
              <Description><![CDATA[${description}]]></Description>
              <PicUrl><![CDATA[${picUrl}]]></PicUrl>
              <Url><![CDATA[]]></Url>  <!-- 空字符串，点击无跳转 -->
            </item>
          </Articles>
        </xml>`.trim();

      //   const replyXml = `
      //   <xml>
      //     <ToUserName><![CDATA[${msg.FromUserName}]]></ToUserName>
      //     <FromUserName><![CDATA[${msg.ToUserName}]]></FromUserName>
      //     <CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
      //     <MsgType><![CDATA[text]]></MsgType>
      //     <Content><![CDATA[关注成功，欢迎桌友们！]]></Content>
      //   </xml>
      // `.trim();

      // 加密回复
      const encryptedReply = aesEncrypt(
        replyXml,
        token,
        encodingAesKey,
        appId,
        timestamp,
        nonce
      );

      return res.status(200).send(encryptedReply);
    }

    // 其他消息处理
    return res.status(200).send("success");
  } catch (err) {
    console.error("[WeChat OA] Error handling message:", err);
    return res.status(200).send("success");
  }
}

module.exports = {
  wechatVerify,
  wechatReceive,
};

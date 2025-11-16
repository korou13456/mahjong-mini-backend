const crypto = require("crypto");

function sha1Hex(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

function buildSignature(token, timestamp, nonce) {
  const arr = [token, timestamp, nonce].sort();
  return sha1Hex(arr.join(""));
}

function buildMsgSignature(token, timestamp, nonce, encrypt) {
  const arr = [token, timestamp, nonce, encrypt].sort();
  return sha1Hex(arr.join(""));
}

function pkcs7Unpad(buffer) {
  const pad = buffer[buffer.length - 1];
  if (pad < 1 || pad > 32) return buffer;
  return buffer.slice(0, buffer.length - pad);
}

function aesDecrypt(encryptBase64, encodingAesKey) {
  // 43-char key -> pad '=' to 44 and base64 decode to 32 bytes key
  const aesKey = Buffer.from(encodingAesKey + "=", "base64");
  const iv = aesKey.slice(0, 16);
  const cipherText = Buffer.from(encryptBase64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-cbc", aesKey, iv);
  decipher.setAutoPadding(false);
  let decrypted = Buffer.concat([
    decipher.update(cipherText),
    decipher.final(),
  ]);
  decrypted = pkcs7Unpad(decrypted);

  // Structure: 16B random + 4B msg_len + msg + appid
  const content = decrypted.slice(16);
  const msgLen = content.readUInt32BE(0);
  const msg = content.slice(4, 4 + msgLen);
  const appId = content.slice(4 + msgLen).toString("utf8");
  return { msg: msg.toString("utf8"), appId };
}

function aesEncrypt(
  replyMessage,
  token,
  encodingAesKey,
  appId,
  timestamp,
  nonce
) {
  const AES_KEY = Buffer.from(encodingAesKey + "=", "base64");
  const random16 = crypto.randomBytes(16);
  const msg = Buffer.from(replyMessage);
  const msgLength = Buffer.alloc(4);
  msgLength.writeUInt32BE(msg.length, 0);
  const appIdBuffer = Buffer.from(appId);

  const bufMsg = Buffer.concat([random16, msgLength, msg, appIdBuffer]);
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    AES_KEY,
    AES_KEY.slice(0, 16)
  );
  cipher.setAutoPadding(false);

  const blockSize = 32;
  const padAmount = blockSize - (bufMsg.length % blockSize);
  const pad = Buffer.alloc(padAmount, padAmount);

  const finalBuf = Buffer.concat([bufMsg, pad]);

  const encrypted = Buffer.concat([cipher.update(finalBuf), cipher.final()]);

  // 生成签名
  const sha1 = crypto.createHash("sha1");
  const rawList = [
    token,
    timestamp,
    nonce,
    encrypted.toString("base64"),
  ].sort();
  sha1.update(rawList.join(""));
  const signature = sha1.digest("hex");

  // 返回加密消息XML
  return `<xml>
    <Encrypt><![CDATA[${encrypted.toString("base64")}]]></Encrypt>
    <MsgSignature><![CDATA[${signature}]]></MsgSignature>
    <TimeStamp>${timestamp}</TimeStamp>
    <Nonce><![CDATA[${nonce}]]></Nonce>
  </xml>`;
}

module.exports = {
  buildSignature,
  buildMsgSignature,
  aesDecrypt,
  aesEncrypt,
};

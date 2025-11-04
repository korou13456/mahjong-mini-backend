// generate-secret.js
const crypto = require("crypto");
const jwtSecret = crypto.randomBytes(64).toString("hex");
console.log("生成的JWT_SECRET:");
console.log(jwtSecret);
console.log("\n请将上面的字符串复制到 .env 文件中");

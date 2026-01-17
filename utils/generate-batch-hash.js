const crypto = require('crypto');

/**
 * 生成批量导入记录的hash指纹
 * @param {Object} record - 记录对象
 * @returns {string} SHA256 hash值
 */
function generateBatchHash(record) {
  // 将record对象转换为字符串，按字段名排序确保一致性
  const sortedKeys = Object.keys(record).sort();
  const hashData = sortedKeys.map(key => {
    const value = record[key];
    if (Array.isArray(value)) {
      return `${key}:${JSON.stringify(value.sort())}`;
    } else if (value === null || value === undefined) {
      return `${key}:`;
    } else {
      return `${key}:${value}`;
    }
  }).join('|');

  return crypto.createHash('sha256').update(hashData).digest('hex');
}

module.exports = generateBatchHash;

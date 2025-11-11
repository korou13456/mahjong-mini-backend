// utils/wechat/templates/tableSuccessUser.js
module.exports = {
  templateId: "BQAMIYf4LkJpFargI-ufoSCcEqdFgvsxhLtcoAZYRzo", // 你的拼桌成功模板ID
  buildData: (payload) => {
    const {
      tableId,
      roomTitle,
      nickname,
      storeName,
      storeAddress,
      storePhone,
    } = payload;
    return {
      character_string42: { value: tableId || "" }, // 预约码
      thing36: { value: roomTitle || "4人拼桌成功" }, // 订单名称
      thing2: { value: storeName || "乔斯波麻将馆" }, // 预约门店
      thing20: { value: storeAddress || "莆田市xx路xx号" }, // 门店地址
      phone_number21: { value: storePhone || "0594-xxxxxxx" }, // 门店电话
      remark: { value: "点击进入查看详情～" }, // 跳转文案
    };
  },
};

// Excel表格解析工具 - JavaScript逻辑
const BASE_URL = window.location.origin;

// 全局状态
let currentData = null;
let currentSheetIndex = 0;
let originalFileName = "";

// DOM 元素引用
const uploadArea = document.getElementById("uploadArea");
const fileInput = document.getElementById("fileInput");
const resultSection = document.getElementById("resultSection");
const loading = document.getElementById("loading");
const errorMessage = document.getElementById("errorMessage");

// 初始化
function init() {
  setupEventListeners();
}

// 设置事件监听器
function setupEventListeners() {
  uploadArea.addEventListener("click", () => fileInput.click());

  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.classList.add("dragover");
  });

  uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("dragover");
  });

  uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadArea.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });
}

// 处理文件上传
async function handleFile(file) {
  if (!validateFile(file)) return;

  originalFileName = file.name.replace(/\.[^/.]+$/, "");
  showLoading();
  hideResult();
  hideError();

  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const result = parseWorkbook(workbook, file);

    currentData = result.data;
    currentSheetIndex = 0;
    displayResult(result);
  } catch (error) {
    showError("解析失败: " + error.message);
  } finally {
    hideLoading();
  }
}

// 验证文件
function validateFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext !== "xlsx" && ext !== "xls") {
    showError("只支持 .xlsx 或 .xls 格式的文件");
    return false;
  }

  if (file.size > 10 * 1024 * 1024) {
    showError("文件大小不能超过 10MB");
    return false;
  }

  return true;
}

// 解析工作簿
function parseWorkbook(workbook, file) {
  return {
    file: {
      originalName: file.name,
      size: file.size,
      mimetype:
        file.type ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    data: {
      sheets: workbook.SheetNames.map((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils
          .sheet_to_json(worksheet, { header: 1 })
          .filter(
            (row) =>
              row &&
              row.length > 0 &&
              !row.every((cell) => cell === undefined || cell === "")
          );
        console.log(jsonData);
        return {
          name: sheetName,
          data: jsonData,
          rowCount: jsonData.length,
          columnCount:
            jsonData.length > 0
              ? Math.max(...jsonData.map((row) => row.length))
              : 0,
        };
      }),
      sheetCount: workbook.SheetNames.length,
    },
  };
}

// 显示结果
function displayResult(result) {
  showResult();
  displayFileInfo(result.file);
  displaySheetTabs();
  displaySheetData(currentSheetIndex);
}

// 显示文件信息
function displayFileInfo(fileInfo) {
  document.getElementById(
    "fileInfoText"
  ).innerHTML = `<strong>文件名:</strong> ${fileInfo.originalName}<br>
         <strong>大小:</strong> ${(fileInfo.size / 1024).toFixed(2)} KB<br>
         <strong>类型:</strong> ${fileInfo.mimetype}`;
}

// 显示工作表标签页
function displaySheetTabs() {
  const tabsContainer = document.getElementById("sheetTabs");
  tabsContainer.innerHTML = "";

  currentData.sheets.forEach((sheet, index) => {
    const tab = document.createElement("button");
    tab.className = `sheet-tab ${index === currentSheetIndex ? "active" : ""}`;
    tab.textContent = sheet.name;
    tab.onclick = () => switchSheet(index);
    tabsContainer.appendChild(tab);
  });

  document.getElementById("sheetCount").textContent = currentData.sheetCount;
}

// 切换工作表
function switchSheet(index) {
  currentSheetIndex = index;
  displaySheetTabs();
  displaySheetData(index);
}

// 显示工作表数据
function displaySheetData(index) {
  const sheet = currentData.sheets[index];
  const table = document.getElementById("dataTable");

  document.getElementById("rowCount").textContent = sheet.rowCount;
  document.getElementById("columnCount").textContent = sheet.columnCount;

  if (sheet.data.length === 0) {
    table.innerHTML = "<tr><td>该工作表为空</td></tr>";
    return;
  }

  let html = "";
  sheet.data.forEach((row, rowIndex) => {
    const cells = row
      .map((cell) => `<td>${cell !== undefined ? cell : ""}</td>`)
      .join("");
    html += `<tr>${cells}</tr>`;
  });

  table.innerHTML = html;
}

// 更新输入框显示
function updateInputs() {
  const priceType = document.getElementById("priceType").value;
  const category = document.getElementById("category").value;
  const extraInputs = document.getElementById("extraInputs");
  const tshirtInputs = document.getElementById("tshirtInputs");
  const beachTowelInputs = document.getElementById("beachTowelInputs");

  if (priceType === "fixed") {
    extraInputs.style.display = "block";
    if (category === "tshirt") {
      tshirtInputs.style.display = "block";
      beachTowelInputs.style.display = "none";
    } else if (category === "beach_towel") {
      tshirtInputs.style.display = "none";
      beachTowelInputs.style.display = "block";
    } else {
      extraInputs.style.display = "none";
    }
  } else {
    extraInputs.style.display = "none";
  }
}

// 导出数据
async function exportData(exportBtn) {
  const startTime = performance.now();

  // 禁用按钮
  exportBtn.disabled = true;
  exportBtn.textContent = "处理中...";

  try {
    const { category, config } = getConfig();
    if (!validateConfig(category, config, exportBtn)) return;
    if (!validateData(exportBtn)) return;

    const tempData = processData(category, config);
    const newData = generateFinalData(tempData, config.stockQuantity);
    const merges = generateMerges(tempData);

    await exportToTemplate(newData, merges);

    console.log("总耗时:", (performance.now() - startTime).toFixed(2), "ms");
  } catch (error) {
    console.error("导出错误:", error);
    showError("导出失败: " + error.message);
  } finally {
    // 恢复按钮状态
    exportBtn.disabled = false;
    exportBtn.textContent = "导出表格";
  }
}

// 获取配置
function getConfig() {
  const priceType = document.getElementById("priceType").value;
  const category = document.getElementById("category").value;

  const config = { priceType, category };

  if (category === "tshirt") {
    config.activityDiscount = parseFloat(
      document.getElementById("activityDiscount").value
    );
    config.fixedPrice = parseFloat(document.getElementById("fixedPrice").value);
    config.stockQuantity = parseInt(
      document.getElementById("stockQuantity").value
    );
  } else if (category === "beach_towel") {
    config.activityDiscountBeach = parseFloat(
      document.getElementById("activityDiscountBeach").value
    );
    config.price3252 = parseFloat(document.getElementById("price3252").value);
    config.price3060 = parseFloat(document.getElementById("price3060").value);
    config.price3070 = parseFloat(document.getElementById("price3070").value);
    config.stockQuantity = parseInt(
      document.getElementById("stockQuantityBeach").value
    );
  }

  return { category, config };
}

// 验证配置
function validateConfig(category, config, exportBtn) {
  if (category === "tshirt") {
    if (
      isNaN(config.activityDiscount) ||
      isNaN(config.fixedPrice) ||
      isNaN(config.stockQuantity)
    ) {
      showError("请填写所有必填项");
      return false;
    }
  } else if (category === "beach_towel") {
    if (
      isNaN(config.activityDiscountBeach) ||
      isNaN(config.price3252) ||
      isNaN(config.price3060) ||
      isNaN(config.price3070) ||
      isNaN(config.stockQuantity)
    ) {
      showError("请填写所有必填项");
      return false;
    }
  }
  return true;
}

// 验证数据
function validateData(exportBtn) {
  if (!currentData || currentData.sheets.length === 0) {
    showError("没有可导出的数据");
    return false;
  }
  return true;
}

// 处理数据
function processData(category, config) {
  const sheet = currentData.sheets[currentSheetIndex];
  const rows = sheet.data;
  const filteredGoodsIds = new Set();

  // 第一遍扫描
  rows.slice(1).forEach((row) => {
    const goodsId = row[5] || "";
    const condition1 = getCondition1(row, category, config);
    const condition2 = getCondition2(row, category, config);

    if (!condition1 || !condition2) {
      filteredGoodsIds.add(goodsId);
    }
  });

  // 第二遍生成数据
  let tempData = rows
    .slice(1)
    .filter((row) => !filteredGoodsIds.has(row[5] || ""));

  if (category === "beach_towel") {
    tempData = tempData.filter((row) => row[5] !== undefined && row[5] !== "");
  }

  return tempData.map((row) => {
    const goodsId = row[5] || "";
    const skuId = row[6] || "";
    const calculatedPrice = calculatePrice(row, category, config);
    return { goodsId, skuId, calculatedPrice: calculatedPrice.toFixed(2) };
  });
}

// 获取条件1
function getCondition1(row, category, config) {
  const originalPrice = parseFloat(row[9]) || 0;

  if (category === "tshirt") {
    return originalPrice * config.activityDiscount > config.fixedPrice;
  } else if (category === "beach_towel") {
    const variant = (row[7] || "").trim();
    let calculatedPrice;
    if (variant === "32*52inch") {
      calculatedPrice = config.price3252;
    } else if (variant === "30*60inch") {
      calculatedPrice = config.price3060;
    } else if (variant === "30*70inch") {
      calculatedPrice = config.price3070;
    }
    return originalPrice * config.activityDiscountBeach > calculatedPrice;
  }
  return false;
}

// 获取条件2
function getCondition2(row, category, config) {
  const originalPrice = parseFloat(row[9]) || 0;

  if (category === "tshirt") {
    return originalPrice * 0.1 < config.fixedPrice;
  } else if (category === "beach_towel") {
    const variant = (row[7] || "").trim();
    let calculatedPrice;
    if (variant === "32*52inch") {
      calculatedPrice = config.price3252;
    } else if (variant === "30*60inch") {
      calculatedPrice = config.price3060;
    } else if (variant === "30*70inch") {
      calculatedPrice = config.price3070;
    }
    return originalPrice * 0.1 < calculatedPrice;
  }
  return false;
}

// 计算价格
function calculatePrice(row, category, config) {
  const originalPrice = parseFloat(row[9]) || 0;

  if (category === "tshirt") {
    if (originalPrice * config.activityDiscount > config.fixedPrice) {
      return config.fixedPrice;
    } else {
      return originalPrice * 0.1;
    }
  } else if (category === "beach_towel") {
    const variant = (row[7] || "").trim();
    if (variant === "32*52inch") {
      return config.price3252;
    } else if (variant === "30*60inch") {
      return config.price3060;
    } else if (variant === "30*70inch") {
      return config.price3070;
    }
  }
  return 0;
}

// 生成最终数据
function generateFinalData(tempData, stockQuantity) {
  const goodsIdToRowRange = {};

  tempData.forEach((item, index) => {
    const goodsId = item.goodsId;
    if (!goodsIdToRowRange[goodsId]) {
      goodsIdToRowRange[goodsId] = { start: index, end: index };
    } else {
      goodsIdToRowRange[goodsId].end = index;
    }
  });

  return tempData.map((item, index) => {
    const range = goodsIdToRowRange[item.goodsId];
    const quantity = index === range.start ? stockQuantity : "";
    return [item.goodsId, item.skuId, item.calculatedPrice, quantity];
  });
}

// 生成合并单元格配置
function generateMerges(tempData) {
  const goodsIdToRowRange = {};
  const merges = [];

  tempData.forEach((item, index) => {
    const goodsId = item.goodsId;
    if (!goodsIdToRowRange[goodsId]) {
      goodsIdToRowRange[goodsId] = { start: index, end: index };
    } else {
      goodsIdToRowRange[goodsId].end = index;
    }
  });

  Object.keys(goodsIdToRowRange).forEach((goodsId) => {
    const range = goodsIdToRowRange[goodsId];
    if (range.start !== range.end) {
      merges.push({
        s: { r: range.start + 2, c: 3 },
        e: { r: range.end + 2, c: 3 },
      });
    }
  });

  return merges;
}

// 导出到模板
async function exportToTemplate(newData, merges) {
  const templateLoadStart = performance.now();

  const response = await fetch(`${BASE_URL}/api/commerce/template`);
  if (!response.ok) {
    throw new Error(`加载模板失败 (${response.status})`);
  }

  const data = await response.arrayBuffer();
  console.log(
    "模板加载时间:",
    (performance.now() - templateLoadStart).toFixed(2),
    "ms"
  );

  const workbook = XLSX.read(data, { type: "array" });
  const templateSheet = workbook.Sheets["Template"];
  const templateData = XLSX.utils.sheet_to_json(templateSheet, { header: 1 });

  // 保留前两行，填充数据
  const exportData = [templateData[0], templateData[1], ...newData];

  // 创建工作表
  const ws = XLSX.utils.aoa_to_sheet(exportData);

  // 添加合并单元格
  if (merges.length > 0) {
    ws["!merges"] = merges;
  }

  // 替换原工作簿中的 Template 工作表
  workbook.Sheets["Template"] = ws;

  // 导出文件
  XLSX.writeFile(workbook, `${originalFileName}（已处理）.xlsx`);
}

// UI 工具函数
function showLoading() {
  loading.classList.add("active");
}

function hideLoading() {
  loading.classList.remove("active");
}

function showResult() {
  resultSection.classList.add("active");
}

function hideResult() {
  resultSection.classList.remove("active");
}

function showError(message) {
  errorMessage.textContent = "❌ " + message;
  errorMessage.classList.add("active");
}

function hideError() {
  errorMessage.classList.remove("active");
}

// 重置
function reset() {
  hideResult();
  hideError();
  fileInput.value = "";
  currentData = null;
  currentSheetIndex = 0;
  document.getElementById("extraInputs").style.display = "none";
}

// 页面加载完成后初始化
document.addEventListener("DOMContentLoaded", init);

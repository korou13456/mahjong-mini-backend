// Excel表格解析工具 - JavaScript逻辑
const BASE_URL = window.location.origin;

// 全局状态
let currentData = null;
let currentSheetIndex = 0;
let originalFileName = "";

// DOM 元素引用
const uploadArea = document.getElementById("uploadArea");
const fileInput = document.getElementById("fileInput");
const uploadSection = document.getElementById("uploadSection");
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
  hideUploadSection();

  try {
    // 使用 setTimeout 让 UI 有机会渲染
    await new Promise(resolve => setTimeout(resolve, 10));

    const data = await file.arrayBuffer();

    // 分步解析，避免卡顿
    await new Promise(resolve => setTimeout(resolve, 10));

    const workbook = XLSX.read(data, { type: "array" });
    const result = parseWorkbook(workbook, file);

    currentData = result.data;
    currentSheetIndex = 0;

    // 使用 setTimeout 异步显示结果
    setTimeout(() => {
      displayResult(result);
      hideLoading();
    }, 10);
  } catch (error) {
    hideLoading();
    showError("解析失败: " + error.message);
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

  // 不再渲染数据，只显示提示
  table.innerHTML = `<tr><td>数据已加载，共 ${sheet.rowCount} 行，请直接进行导出操作</td></tr>`;
}

// 更新输入框显示
function updateInputs() {
  const priceType = document.getElementById("priceType").value;
  const category = document.getElementById("category").value;
  const extraInputs = document.getElementById("extraInputs");
  const tshirtInputs = document.getElementById("tshirtInputs");
  const blanketInputs = document.getElementById("blanketInputs");
  const beachTowelInputs = document.getElementById("beachTowelInputs");

  if (priceType === "fixed") {
    extraInputs.style.display = "block";
    if (category === "tshirt") {
      tshirtInputs.style.display = "block";
      blanketInputs.style.display = "none";
      beachTowelInputs.style.display = "none";
    } else if (category === "blanket") {
      tshirtInputs.style.display = "none";
      blanketInputs.style.display = "block";
      beachTowelInputs.style.display = "none";
    } else if (category === "beach_towel") {
      tshirtInputs.style.display = "none";
      blanketInputs.style.display = "none";
      beachTowelInputs.style.display = "block";
    } else {
      extraInputs.style.display = "none";
    }
  } else {
    extraInputs.style.display = "none";
  }

  // 加载保存的配置
  loadSavedConfig(category);
}

// 加载保存的配置
function loadSavedConfig(category) {
  if (!category) {
    document.getElementById('saveConfig').checked = false;
    return;
  }

  const savedConfig = JSON.parse(localStorage.getItem('priceConfig') || '{}');
  const config = savedConfig[category];

  // 如果有保存的配置，自动勾选"记录价格和库存数量"
  if (config) {
    document.getElementById('saveConfig').checked = true;

    if (category === 'tshirt') {
      document.getElementById('activityDiscount').value = config.activityDiscount || '';
      document.getElementById('fixedPrice').value = config.fixedPrice || '';
      document.getElementById('stockQuantity').value = config.stockQuantity || '';
    } else if (category === 'blanket') {
      document.getElementById('activityDiscountBlanket').value = config.activityDiscountBlanket || '';
      document.getElementById('price3040').value = config.price3040 || '';
      document.getElementById('price4050').value = config.price4050 || '';
      document.getElementById('price5060').value = config.price5060 || '';
      document.getElementById('price6080').value = config.price6080 || '';
      document.getElementById('stockQuantityBlanket').value = config.stockQuantity || '';
    } else if (category === 'beach_towel') {
      document.getElementById('activityDiscountBeach').value = config.activityDiscountBeach || '';
      document.getElementById('price3252').value = config.price3252 || '';
      document.getElementById('price3060').value = config.price3060 || '';
      document.getElementById('price3070').value = config.price3070 || '';
      document.getElementById('stockQuantityBeach').value = config.stockQuantity || '';
    }
  } else {
    document.getElementById('saveConfig').checked = false;
  }
}

// 保存配置
function saveCurrentConfig(category, config) {
  if (!category) return;

  const saveConfigCheckbox = document.getElementById('saveConfig');
  if (!saveConfigCheckbox.checked) return;

  const savedConfig = JSON.parse(localStorage.getItem('priceConfig') || '{}');
  savedConfig[category] = config;
  localStorage.setItem('priceConfig', JSON.stringify(savedConfig));
}

// 导出数据
async function exportData(exportBtn) {
  const startTime = performance.now();

  // 禁用按钮
  exportBtn.disabled = true;
  exportBtn.textContent = "处理中...";

  try {
    // 给 UI 更新的机会
    await new Promise(resolve => setTimeout(resolve, 10));

    const { category, config } = getConfig();
    if (!validateConfig(category, config, exportBtn)) return;
    if (!validateData(exportBtn)) return;

    // 保存配置
    saveCurrentConfig(category, config);

    // 分步处理大数据
    await new Promise(resolve => setTimeout(resolve, 10));

    const tempData = processData(category, config);

    await new Promise(resolve => setTimeout(resolve, 10));

    const newData = generateFinalData(tempData, config.stockQuantity);
    const merges = generateMerges(tempData);

    await new Promise(resolve => setTimeout(resolve, 10));

    // 检查是否需要分表
    const uniqueGoodsIds = new Set(tempData.map((item) => item.goodsId));
    const needsSplit = uniqueGoodsIds.size > 2000 || newData.length > 1500;

    if (needsSplit) {
      await exportSplitSheets(newData, merges);
    } else {
      await exportToTemplate(newData, merges);
    }

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
  } else if (category === "blanket") {
    config.activityDiscountBlanket = parseFloat(
      document.getElementById("activityDiscountBlanket").value
    );
    config.price3040 = parseFloat(document.getElementById("price3040").value);
    config.price4050 = parseFloat(document.getElementById("price4050").value);
    config.price5060 = parseFloat(document.getElementById("price5060").value);
    config.price6080 = parseFloat(document.getElementById("price6080").value);
    config.stockQuantity = parseInt(
      document.getElementById("stockQuantityBlanket").value
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
  } else if (category === "blanket") {
    if (
      isNaN(config.activityDiscountBlanket) ||
      isNaN(config.price3040) ||
      isNaN(config.price4050) ||
      isNaN(config.price5060) ||
      isNaN(config.price6080) ||
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
    console.log(condition1, condition2, goodsId, "!====>>>1231");
    if (!condition1 || !condition2) {
      filteredGoodsIds.add(goodsId);
    }
  });

  console.log(filteredGoodsIds, "!====>>filteredGoodsIds");

  // 第二遍生成数据
  let tempData = rows
    .slice(1)
    .filter((row) => !filteredGoodsIds.has(row[5] || ""));

  if (category === "blanket" || category === "beach_towel") {
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
  } else if (category === "blanket") {
    const variant = (row[7] || "").trim();
    let calculatedPrice;
    if (/30\*40/.test(variant)) {
      calculatedPrice = config.price3040;
    } else if (/40\*50/.test(variant)) {
      calculatedPrice = config.price4050;
    } else if (/50\*60/.test(variant)) {
      calculatedPrice = config.price5060;
    } else if (/60\*80/.test(variant)) {
      calculatedPrice = config.price6080;
    }
    return calculatedPrice
      ? originalPrice * config.activityDiscountBlanket > calculatedPrice
      : false;
  } else if (category === "beach_towel") {
    const variant = (row[7] || "").trim();
    let calculatedPrice;
    if (/32\*52/.test(variant)) {
      calculatedPrice = config.price3252;
    } else if (/30\*60/.test(variant)) {
      calculatedPrice = config.price3060;
    } else if (/30\*70/.test(variant)) {
      calculatedPrice = config.price3070;
    }
    return calculatedPrice
      ? originalPrice * config.activityDiscountBeach > calculatedPrice
      : false;
  }
  return false;
}

// 获取条件2
function getCondition2(row, category, config) {
  const originalPrice = parseFloat(row[9]) || 0;

  if (category === "tshirt") {
    return originalPrice * 0.1 < config.fixedPrice;
  } else if (category === "blanket") {
    const variant = (row[7] || "").trim();
    let calculatedPrice;
    if (/30\*40/.test(variant)) {
      calculatedPrice = config.price3040;
    } else if (/40\*50/.test(variant)) {
      calculatedPrice = config.price4050;
    } else if (/50\*60/.test(variant)) {
      calculatedPrice = config.price5060;
    } else if (/60\*80/.test(variant)) {
      calculatedPrice = config.price6080;
    }
    return calculatedPrice ? originalPrice * 0.1 < calculatedPrice : false;
  } else if (category === "beach_towel") {
    const variant = (row[7] || "").trim();
    let calculatedPrice;
    if (/32\*52/.test(variant)) {
      calculatedPrice = config.price3252;
    } else if (/30\*60/.test(variant)) {
      calculatedPrice = config.price3060;
    } else if (/30\*70/.test(variant)) {
      calculatedPrice = config.price3070;
    }
    return calculatedPrice ? originalPrice * 0.1 < calculatedPrice : false;
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
  } else if (category === "blanket") {
    const variant = (row[7] || "").trim();
    if (/30\*40/.test(variant)) {
      return config.price3040;
    } else if (/40\*50/.test(variant)) {
      return config.price4050;
    } else if (/50\*60/.test(variant)) {
      return config.price5060;
    } else if (/60\*80/.test(variant)) {
      return config.price6080;
    }
  } else if (category === "beach_towel") {
    const variant = (row[7] || "").trim();
    if (/32\*52/.test(variant)) {
      return config.price3252;
    } else if (/30\*60/.test(variant)) {
      return config.price3060;
    } else if (/30\*70/.test(variant)) {
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

// 分表导出
async function exportSplitSheets(newData, originalMerges) {
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

  const templateWorkbook = XLSX.read(data, { type: "array" });
  const templateSheet = templateWorkbook.Sheets["Template"];
  const templateData = XLSX.utils.sheet_to_json(templateSheet, { header: 1 });

  // 分表逻辑：按商品ID分组
  const goodsIdGroups = {};
  newData.forEach((row, index) => {
    const goodsId = row[0];
    if (!goodsIdGroups[goodsId]) {
      goodsIdGroups[goodsId] = [];
    }
    goodsIdGroups[goodsId].push({ data: row, index });
  });

  // 生成分表列表
  const files = [];
  let currentFileData = [];
  let currentFileMerges = [];
  let currentFileUniqueGoods = new Set();
  let fileNumber = 1;

  Object.keys(goodsIdGroups).forEach((goodsId) => {
    const items = goodsIdGroups[goodsId];

    // 检查是否需要新建分表文件
    const wouldExceedGoodsLimit = currentFileUniqueGoods.size + 1 > 2000;
    const wouldExceedRowLimit = currentFileData.length + items.length > 30000;

    if (
      (wouldExceedGoodsLimit || wouldExceedRowLimit) &&
      currentFileData.length > 0
    ) {
      // 保存当前分表文件
      files.push({
        data: currentFileData,
        merges: currentFileMerges,
        number: fileNumber,
      });
      fileNumber++;

      // 重置
      currentFileData = [];
      currentFileMerges = [];
      currentFileUniqueGoods = new Set();
    }

    // 添加商品到当前分表文件
    const startIndex = currentFileData.length;
    items.forEach((item, itemIndex) => {
      const { data: rowData, index: originalIndex } = item;
      currentFileData.push(rowData);
    });

    // 检查是否需要合并单元格（商品有多个SKU）
    if (items.length > 1) {
      currentFileMerges.push({
        s: { r: startIndex + 2, c: 3 },
        e: { r: startIndex + items.length - 1 + 2, c: 3 },
      });
    }

    currentFileUniqueGoods.add(goodsId);
  });

  // 添加最后一个分表文件
  if (currentFileData.length > 0) {
    files.push({
      data: currentFileData,
      merges: currentFileMerges,
      number: fileNumber,
    });
  }

    // 为每个分表生成独立文件（分步处理，避免卡顿）
  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    // 给 UI 更新的机会
    await new Promise(resolve => setTimeout(resolve, 10));

    // 创建新工作簿
    const workbook = XLSX.utils.book_new();

    // 保留模板的前两个工作表
    workbook.Sheets["Template Usage Guide"] =
      templateWorkbook.Sheets["Template Usage Guide"];
    workbook.Sheets["Data definition"] =
      templateWorkbook.Sheets["Data definition"];

    // 创建Template工作表
    const exportData = [templateData[0], templateData[1], ...file.data];
    const ws = XLSX.utils.aoa_to_sheet(exportData);
    if (file.merges.length > 0) {
      ws["!merges"] = file.merges;
    }
    workbook.Sheets["Template"] = ws;

    // 更新工作表名称列表
    workbook.SheetNames = [
      "Template Usage Guide",
      "Data definition",
      "Template",
    ];

    // 导出文件
    XLSX.writeFile(
      workbook,
      `${originalFileName}（已处理-第${file.number}部分）.xlsx`
    );

    console.log(`第 ${file.number} 部分导出完成`);
  }

  console.log(`数据已分为 ${files.length} 个独立文件`);
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

function hideUploadSection() {
  uploadSection.style.display = "none";
}

function showUploadSection() {
  uploadSection.style.display = "block";
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
  showUploadSection();
  hideError();
  fileInput.value = "";
  currentData = null;
  currentSheetIndex = 0;
  document.getElementById("extraInputs").style.display = "none";
  document.getElementById("saveConfig").checked = false;

  // 重置所有输入框
  document.getElementById("priceType").value = "";
  document.getElementById("category").value = "";
  document.getElementById("activityDiscount").value = "";
  document.getElementById("fixedPrice").value = "";
  document.getElementById("stockQuantity").value = "";
  document.getElementById("activityDiscountBlanket").value = "";
  document.getElementById("price3040").value = "";
  document.getElementById("price4050").value = "";
  document.getElementById("price5060").value = "";
  document.getElementById("price6080").value = "";
  document.getElementById("stockQuantityBlanket").value = "";
  document.getElementById("activityDiscountBeach").value = "";
  document.getElementById("price3252").value = "";
  document.getElementById("price3060").value = "";
  document.getElementById("price3070").value = "";
  document.getElementById("stockQuantityBeach").value = "";
}

// 页面加载完成后初始化
document.addEventListener("DOMContentLoaded", init);

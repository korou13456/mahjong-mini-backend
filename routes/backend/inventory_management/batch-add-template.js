// 批量添加库存记录 - 模板文件（供参考）

// ========================================
// 订单记录批量添加接口
// ========================================
// POST /api/backend/batch-import-order-record
curl --url 'http://localhost:3000/api/backend/batch-import-order-record' \
  --header 'Content-Type: application/json' \
  --data '{
    "records": [
      {
        "order_no": "ORDER20260115001",
        "order_user": "user123"
      },
      {
        "order_no": "ORDER20260115002",
        "order_user": "user456"
      },
      {
        "order_no": "ORDER20260115003",
        "order_user": "user789"
      }
    ]
  }'

/*

// ========================================
// 1. 毛毯批量添加记录接口
// ========================================
// POST /api/backend/inventory_blanket/batch-add
curl --url 'http://localhost:3000/api/backend/inventory_blanket/batch-add' \
  --header 'Content-Type: application/json' \
  --data '{
    "records": [
      {
        "record_date": "2026-01-14",
        "status": 1,
        "size_40_30": 10,
        "size_50_40": 5,
        "size_60_50": 3,
        "size_70_60": 2,
        "size_80_60": 1,
        "remark": "采购入库",
        "image_urls": ["http://example.com/image1.jpg", "http://example.com/image2.jpg"]
      },
      {
        "record_date": "2026-01-14",
        "status": 2,
        "size_60_50": -2,
        "remark": "销售出库"
      }
    ]
  }'

// ========================================
// 2. T恤批量添加记录接口
// ========================================
// POST /api/backend/inventory_tshirt/batch-add
curl --url 'http://localhost:3000/api/backend/inventory_tshirt/batch-add' \
  --header 'Content-Type: application/json' \
  --data '{
    "records": [
      {
        "record_date": "2026-01-14",
        "status": 1,
        "black_s": 5,
        "black_m": 10,
        "black_l": 8,
        "black_xl": 5,
        "black_xxl": 3,
        "black_3xl": 2,
        "black_4xl": 1,
        "black_5xl": 0,
        "white_s": 3,
        "white_m": 7,
        "white_l": 6,
        "white_xl": 4,
        "white_xxl": 2,
        "white_3xl": 1,
        "white_4xl": 0,
        "white_5xl": 0,
        "remark": "采购入库",
        "image_urls": ["http://example.com/image1.jpg"]
      },
      {
        "record_date": "2026-01-14",
        "status": 2,
        "black_m": -2,
        "white_l": -3,
        "remark": "销售出库"
      }
    ]
  }'

// ========================================
// 3. 挂毯批量添加记录接口
// ========================================
// POST /api/backend/inventory_tapestry/batch-add
curl --url 'http://localhost:3000/api/backend/inventory_tapestry/batch-add' \
  --header 'Content-Type: application/json' \
  --data '{
    "records": [
      {
        "record_date": "2026-01-14",
        "status": 1,
        "size_40_30": 10,
        "size_60_40": 8,
        "size_60_50": 5,
        "size_80_60": 3,
        "size_90_60": 2,
        "remark": "采购入库",
        "image_urls": ["http://example.com/image1.jpg"]
      },
      {
        "record_date": "2026-01-14",
        "status": 2,
        "size_60_50": -1,
        "remark": "销售出库"
      }
    ]
  }'

// ========================================
// 4. 地垫批量添加记录接口
// ========================================
// POST /api/backend/inventory_doormat/batch-add
curl --url 'http://localhost:3000/api/backend/inventory_doormat/batch-add' \
  --header 'Content-Type: application/json' \
  --data '{
    "records": [
      {
        "record_date": "2026-01-14",
        "status": 1,
        "size_40_60": 15,
        "size_43_75": 10,
        "size_43_120": 5,
        "remark": "采购入库",
        "image_urls": ["http://example.com/image1.jpg"]
      },
      {
        "record_date": "2026-01-14",
        "status": 2,
        "size_43_75": -2,
        "remark": "销售出库"
      }
    ]
  }'

// ========================================
// 5. 帽子批量添加记录接口
// ========================================
// POST /api/backend/inventory_hat/batch-add
curl --url 'http://localhost:3000/api/backend/inventory_hat/batch-add' \
  --header 'Content-Type: application/json' \
  --data '{
    "records": [
      {
        "record_date": "2026-01-14",
        "status": 1,
        "washed_black_denim": 10,
        "washed_sand_denim": 8,
        "red_sandwich_cap": 5,
        "remark": "采购入库",
        "image_urls": ["http://example.com/image1.jpg"]
      },
      {
        "record_date": "2026-01-14",
        "status": 2,
        "washed_black_denim": -3,
        "remark": "销售出库"
      }
    ]
  }'

// ========================================
// 6. 窗帘批量添加记录接口
// ========================================
// POST /api/backend/inventory_curtain/batch-add
curl --url 'http://localhost:3000/api/backend/inventory_curtain/batch-add' \
  --header 'Content-Type: application/json' \
  --data '{
    "records": [
      {
        "record_date": "2026-01-14",
        "status": 1,
        "size_52_63": 10,
        "size_52_84": 8,
        "remark": "采购入库",
        "image_urls": ["http://example.com/image1.jpg"]
      },
      {
        "record_date": "2026-01-14",
        "status": 2,
        "size_52_84": -2,
        "remark": "销售出库"
      }
    ]
  }'

// ========================================
// 7. 鼠标垫批量添加记录接口
// ========================================
// POST /api/backend/inventory_mousepad/batch-add
curl --url 'http://localhost:3000/api/backend/inventory_mousepad/batch-add' \
  --header 'Content-Type: application/json' \
  --data '{
    "records": [
      {
        "record_date": "2026-01-14",
        "status": 1,
        "size_30_80": 20,
        "remark": "采购入库",
        "image_urls": ["http://example.com/image1.jpg"]
      },
      {
        "record_date": "2026-01-14",
        "status": 2,
        "size_30_80": -5,
        "remark": "销售出库"
      }
    ]
  }'

// ========================================
// 8. 卫衣批量添加记录接口
// ========================================
// POST /api/backend/inventory_sweatshirt/batch-add
curl --url 'http://localhost:3000/api/backend/inventory_sweatshirt/batch-add' \
  --header 'Content-Type: application/json' \
  --data '{
    "records": [
      {
        "record_date": "2026-01-14",
        "status": 1,
        "black_s": 3,
        "black_m": 5,
        "black_l": 4,
        "black_xl": 3,
        "black_xxl": 2,
        "black_3xl": 1,
        "black_4xl": 0,
        "black_5xl": 0,
        "gray_s": 2,
        "gray_m": 4,
        "gray_l": 3,
        "gray_xl": 2,
        "gray_xxl": 1,
        "gray_3xl": 0,
        "gray_4xl": 0,
        "gray_5xl": 0,
        "navy_s": 2,
        "navy_m": 4,
        "navy_l": 3,
        "navy_xl": 2,
        "navy_xxl": 1,
        "navy_3xl": 0,
        "navy_4xl": 0,
        "navy_5xl": 0,
        "white_s": 3,
        "white_m": 6,
        "white_l": 5,
        "white_xl": 4,
        "white_xxl": 3,
        "white_3xl": 2,
        "white_4xl": 1,
        "white_5xl": 0,
        "remark": "采购入库",
        "image_urls": ["http://example.com/image1.jpg"]
      },
      {
        "record_date": "2026-01-14",
        "status": 2,
        "black_m": -2,
        "white_l": -3,
        "gray_xl": -1,
        "remark": "销售出库"
      }
    ]
  }'

/*
参数说明:
- records: 记录数组 (必填，数组元素至少1条)
  - record_date: 记录日期 (必填)
  - status: 状态 (必填)
    * 0: 在路上 (只记录明细，不更新库存)
    * 1: 入库 (记录明细并更新库存)
    * 2: 出库 (记录明细并更新库存，数值为负数)
  - 各规格数量: 可选，默认为0
  - remark: 备注 (可选)
  - image_urls: 图片URL数组 (可选)

响应格式:
{
  "code": 200,
  "message": "成功添加 2 条记录"
}
*/

// middleware/basicValidation.js
const { 
  validateRequest, 
  validateNumber, 
  sanitizeString 
} = require("./validation");

// 创建房间参数验证
const createRoomValidation = validateRequest({
  body: {
    start_time: {
      type: 'string',
      required: true,
      validate: (value) => {
        if (!value) throw new Error('开始时间是必需的');
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          throw new Error('开始时间格式不正确');
        }
        return value;
      }
    },
    store_id: {
      type: 'string',
      required: true,
      validate: (value) => sanitizeString(value, { maxLength: 50 })
    },
    pay_type: {
      type: 'number',
      required: false,
      validate: (value) => validateNumber(value, { min: 0, max: 10, integer: true, required: false })
    },
    scoring_tier: {
      type: 'number',
      required: false,
      validate: (value) => validateNumber(value, { min: 0, max: 10, integer: true, required: false })
    },
    special_notes: {
      type: 'string',
      required: false,
      validate: (value) => value ? sanitizeString(value, { maxLength: 500 }) : ''
    },
    duration: {
      type: 'number',
      required: false,
      validate: (value) => validateNumber(value, { min: 30, max: 480, integer: true, required: false })
    },
    mahjong_type: {
      type: 'number',
      required: false,
      validate: (value) => validateNumber(value, { min: 0, max: 10, integer: true, required: false })
    },
    gender_pref: {
      type: 'number',
      required: false,
      validate: (value) => validateNumber(value, { min: 0, max: 2, integer: true, required: false })
    },
    smoking_pref: {
      type: 'number',
      required: false,
      validate: (value) => validateNumber(value, { min: 0, max: 1, integer: true, required: false })
    },
    req_num: {
      type: 'number',
      required: false,
      validate: (value) => validateNumber(value, { min: 2, max: 4, integer: true, required: false })
    },
    currentTableId: {
      type: 'string',
      required: false,
      validate: (value) => value ? sanitizeString(value, { maxLength: 50 }) : value
    }
  }
});

// 加入房间参数验证
const enterRoomValidation = validateRequest({
  body: {
    table_id: {
      type: 'string',
      required: true,
      validate: (value) => sanitizeString(value, { maxLength: 50 })
    }
  }
});

// 退出房间参数验证
const exitRoomValidation = validateRequest({
  body: {
    table_id: {
      type: 'string',
      required: true,
      validate: (value) => sanitizeString(value, { maxLength: 50 })
    }
  }
});

// 更新用户信息参数验证
const updateUserInfoValidation = validateRequest({
  body: {
    nickname: {
      type: 'string',
      required: false,
      validate: (value) => value ? sanitizeString(value, { maxLength: 100 }) : value
    },
    avatar_url: {
      type: 'string',
      required: false,
      validate: (value) => value ? sanitizeString(value, { maxLength: 500 }) : value
    },
    gender: {
      type: 'number',
      required: false,
      validate: (value) => validateNumber(value, { min: 0, max: 2, integer: true, required: false })
    },
    province: {
      type: 'string',
      required: false,
      validate: (value) => value ? sanitizeString(value, { maxLength: 50 }) : value
    },
    city: {
      type: 'string',
      required: false,
      validate: (value) => value ? sanitizeString(value, { maxLength: 50 }) : value
    },
    district: {
      type: 'string',
      required: false,
      validate: (value) => value ? sanitizeString(value, { maxLength: 50 }) : value
    }
  }
});

// 积分相关参数验证
const pointsValidation = validateRequest({
  body: {
    user_id: {
      type: 'number',
      required: true,
      validate: (value) => validateNumber(value, { min: 1, integer: true })
    },
    points: {
      type: 'number',
      required: true,
      validate: (value) => validateNumber(value, { min: -10000, max: 10000, integer: true })
    },
    reason: {
      type: 'string',
      required: false,
      validate: (value) => value ? sanitizeString(value, { maxLength: 200 }) : ''
    }
  }
});

module.exports = {
  createRoomValidation,
  enterRoomValidation,
  exitRoomValidation,
  updateUserInfoValidation,
  pointsValidation,
};
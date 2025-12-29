// routes/commerce/prohibited.js
const db = require("../../config/database");

// 获取配置接口 - 敏感词筛查
const prohibitedScreening = async (req, res) => {
  const connection = await db.getConnection();
  
  try {
    const { title } = req.body;

    // 参数验证
    if (!title || typeof title !== 'string') {
      return res.status(400).json({
        success: false,
        message: "标题不能为空且必须是字符串"
      });
    }

    // 查询启用的敏感词
    const [sensitiveTerms] = await connection.execute(
      "SELECT term FROM sensitive_terms WHERE status = 1",
      []
    );

    if (sensitiveTerms.length === 0) {
      return res.json({
        success: true,
        message: "筛查完成",
        data: {
          title: title,
          contains_prohibited: false,
          matched_terms: [],
          total_matches: 0
        }
      });
    }

    // 筛查敏感词
    const matchedTerms = [];
    const titleForCheck = title.toLowerCase();
    
    for (const termObj of sensitiveTerms) {
      const term = termObj.term.toLowerCase();
      const originalTerm = termObj.term;
      
      // 检查是否包含敏感词（不区分大小写）
      if (titleForCheck.includes(term)) {
        matchedTerms.push({
          term: originalTerm,
          found_in_title: true
        });
      }
    }

    const containsProhibited = matchedTerms.length > 0;

    connection.release();

    res.json({
      success: true,
      message: containsProhibited ? "标题包含违禁词汇" : "标题合规",
      data: {
        title: title,
        contains_prohibited: containsProhibited,
        matched_terms: matchedTerms,
        total_matches: matchedTerms.length,
        suggestion: containsProhibited ? "请修改标题中的违禁词汇" : "标题通过敏感词检测"
      }
    });

  } catch (error) {
    connection.release();
    console.error("敏感词筛查失败:", error);
    res.status(500).json({
      success: false,
      message: "敏感词筛查失败",
      error: error.message
    });
  }
};

module.exports = prohibitedScreening;

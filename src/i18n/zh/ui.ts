export const UI = {
    BUTTONS: {
        REVIEW: '代码审查',
        ADD_COMMENT: '添加评论',
        REQUEST_AI_REVIEW: '请求AI审查',
        GENERATE_REPORT: '生成报告',
        CONFIGURE_API_KEY: '配置API密钥',
        OPEN_SETTINGS: '打开设置'
    },
    TABS: {
        COMMENTS: '评论',
        AI_SUGGESTIONS: 'AI建议',
        ADD_COMMENT: '添加评论'
    },
    PLACEHOLDERS: {
        COMMENT: '在此输入您的评论...',
        LINE_NUMBER: '行号',
        API_KEY: '输入您的AI服务API密钥',
        START_DATE: '输入开始日期 (YYYY-MM-DD)',
        END_DATE: '输入结束日期 (YYYY-MM-DD)',
        DATE_FORMAT: '例如 2023-01-01',
        COMMIT_ID: '输入提交ID或哈希前缀',
        COMMIT_ID_PREFIX: '例如 a1b2c3d',
        SELECT_BRANCH: '选择分支以筛选提交',
        SELECT_MODEL: '选择用于代码审查的AI模型'
    },
    TITLES: {
        BRANCH_SELECTION: '分支选择',
        MODEL_SELECTION: 'AI模型选择'
    },
    MESSAGES: {
        NO_COMMENTS: '暂无评论。添加评论或请求AI审查。',
        NO_AI_SUGGESTIONS: '暂无AI建议。点击"请求AI审查"以分析此文件。',
        CODE_QUALITY_SCORE: (score: number): string => `代码质量评分：${score}/10`,
        INVALID_COMMENT: '请输入评论',
        INVALID_LINE_NUMBER: '请输入有效的行号',
        NO_COMMIT_SELECTED: '请先选择一个提交',
        NO_WORKSPACE: '未打开工作区文件夹',
        NOT_GIT_REPO: '当前工作区不是Git仓库',
        API_KEY_SUCCESS: 'API密钥配置成功！',
        API_KEY_INVALID: 'API密钥无效。请检查您的密钥并重试。',
        API_KEY_MISSING: '未配置API密钥。请配置您的API密钥以使用代码审查功能。',
        ERROR_OPENING_PANEL: (error: string): string => `打开审查面板时出错：${error}`,
        ERROR_GENERATING_REPORT: (error: string): string => `生成报告时出错：${error}`,
        ERROR_START_REVIEW: (error: string): string => `开始审查时出错：${error}`,
        ERROR_REVIEWING_CODE: (error: string): string => `审查代码时出错：${error}`,
        REPORT_GENERATED: (hash: string): string => `已为提交 ${hash} 生成报告`,
        ERROR_FILTERING_COMMITS: (error: string): string => `筛选提交时出错：${error}`,
        ERROR_DATE_FILTER: (error: string): string => `设置日期筛选器时出错：${error}`,
        ERROR_COMMIT_FILTER: (error: string): string => `设置提交ID筛选器时出错：${error}`,
        ERROR_BRANCH_FILTER: (error: string): string => `设置分支筛选器时出错：${error}`,
        ERROR_GIT_DEBUG: (error: string): string => `Git调试时出错：${error}`,
        REFRESHING_COMMITS: '正在刷新提交...',
        COMMITS_REFRESHED: '已刷新提交列表',
        FILES_REFRESHED: '已刷新文件列表',
        COMMIT_SELECTED: '已选择提交',
        SELECT_COMMIT_FIRST: '请先选择一个提交',
        FILTERING_COMMITS: '正在筛选提交...',
        COMMITS_FILTERED: '已按日期范围筛选提交',
        COMMITS_FILTERED_BY_ID: '已按ID筛选提交',
        COMMITS_FILTERED_BY_BRANCH: '已按分支筛选提交',
        CODE_REVIEW_STARTED: '代码审查已开始'
    },
    PANEL: {
        CODE_REVIEW_TITLE: (filePath: string): string => `代码审查：${filePath}`,
        COMMIT_INFO: (hash: string, message: string): string => `提交：${hash} - ${message}`,
        AUTHOR_INFO: (author: string, date: string): string => `作者：${author} - ${date}`
    }
};

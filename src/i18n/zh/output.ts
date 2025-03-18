export const OUTPUT = {
    EXTENSION: {
        ACTIVATE: '代码审查扩展已激活',
        DEACTIVATE: '代码审查扩展已停用'
    },
    REVIEW: {
        REVIEW_START: '开始代码审查:',
        REVIEW_COMPLETE: '代码分析完成:',
        REVIEW_ERROR: '代码审查失败:',
        REVIEW_IN_PROGRESS: '代码审查中...',
        REVIEW_SUCCESS: '代码审查成功:',
        REVIEW_FAILED: '代码审查失败并出现错误:',
        CODE_ANALYSIS_FAILED: '代码分析失败:',
        REVIEWING_FILES: '正在审查文件...',
        AI_ANALYSIS: '正在执行 AI 分析...',
        NO_COMMIT_SELECTED: '未选择提交',
        NO_REVIEW_DATA: (path: string): string => `文件没有可用的审查数据: ${path}`,
        REPORT_GENERATION_FAILED: '生成审查报告失败',
        LARGE_FILE_COMPRESSION: '正在压缩大型文件以提高分析效率...',
        AI_SERVICE_NOT_INITIALIZED: 'AI 模型服务未初始化',
        EMPTY_DIFF_CONTENT: '空或无效的差异内容',
        FILE_TYPE_NOT_SUPPORTED: (path: string): string => `不支持对该文件类型进行代码审查: ${path}`,
        FULL_FILE_ANALYSIS_START: '开始全文件分析请求...',
        FULL_FILE_ANALYSIS_COMPLETE: (length: number): string => `全文件分析完成，响应长度: ${length}`,
        DIFF_ANALYSIS_START: '开始差异分析请求...',
        DIFF_ANALYSIS_COMPLETE: (length: number): string => `差异分析完成，响应长度: ${length}`
    },
    REPOSITORY: {
        REPO_INIT: (repoPath: string): string => `初始化仓库: ${repoPath}`,
        REPO_COMMIT_SELECT: '已选择提交:',
        REPO_COMMIT_NONE: '未选择提交',
        INITIALIZE_REPO: '初始化代码仓库:',
        SELECT_COMMIT: (commitId: string, message: string): string => `选择提交: ${commitId} (${message})`,
        NO_COMMIT: '未选择提交',
        USING_CACHED_COMMIT: '使用缓存提交:',
        REPORT_IN_PROGRESS: '报告生成正在进行中，请稍候...',
        REPO_NOT_FOUND: (path: string): string => `在路径未找到仓库: ${path}`,
        COMMIT_NOT_FOUND: (hash: string): string => `未找到提交: ${hash}`,
        DIFF_GENERATION_FAILED: (path: string): string => `为文件生成差异失败: ${path}`,
        FILE_CONTENT_UNAVAILABLE: '文件内容不可用',
        BRANCH_NOT_FOUND: (branch: string): string => `未找到分支: ${branch}`,
        NOT_GIT_REPOSITORY: '当前工作区不是Git仓库',
        NO_WORKSPACE_FOLDER: '未打开工作区文件夹',
        REFRESHING_COMMITS: '正在刷新提交...',
        REFRESH_COMMITS_ERROR: '刷新提交失败',
        REFRESH_FILES_ERROR: '刷新文件失败',
        COMMIT_SELECTION_ERROR: '选择提交时出错',
        VIEWING_FILE: '正在查看文件:',
        FILE_NOT_FOUND_ERROR: '未找到文件',
        SHOWING_DIFF_ERROR: '显示差异时出错'
    },
    GIT: {
        GETTING_FILE_CONTENT: (filePath: string, commitHash: string): string => `正在获取文件内容: ${filePath}，提交哈希: ${commitHash}`,
        GETTING_FILE_DIFF: (filePath: string, commitHash: string): string => `正在获取文件差异: ${filePath}，提交哈希: ${commitHash}`,
        SETTING_DATE_FILTER: (since: string, until: string): string => `正在设置日期过滤器: 从 ${since} 到 ${until}`,
        SETTING_BRANCH_FILTER: (branch: string): string => `正在设置分支过滤器: ${branch}`,
        EMPTY_FILTER: '无过滤器',
        CLEARING_FILTERS: '正在清除过滤器',
        GETTING_FILES_FOR_COMMIT: (commitHash: string): string => `正在获取提交 ${commitHash} 的文件`,
        FOUND_FILES_FOR_COMMIT_I18N: (filesChanged: number, commitHash: string): string => `提交 ${commitHash} 找到的文件数: ${filesChanged}`,
        GETTING_COMMITS_WITH_SIMPLE_GIT: (filter: string): string => `正在使用 simple-git 获取提交: ${filter}`,
        CALLING_SIMPLE_GIT_LOG_I18N: (logOptions: string): string => `正在调用 simple-git log，参数: ${logOptions}`,
        SIMPLE_GIT_LOG_RETURNED: (length: number): string => `simple-git log 返回了 ${length} 个提交`,
        GETTING_COMMITS_WITH_DIRECT_COMMAND: (filter: string): string => `正在使用直接命令获取提交: ${filter}`,
        USING_SIMPLE_GIT_DIFF: '方法1: 正在尝试使用 simple-git diff 获取文件差异...',
        SUCCESSFULLY_GOT_DIFF_USING_SIMPLE_GIT_DIFF: '使用 simple-git diff 成功获取差异',
        DIFF_CONTENT_PREVIEW: (preview: string, total: number): string => `差异内容预览:\n${preview}... (总共 ${total} 个字符)`,
        NO_DIFF_CONTENT: '没有可用的差异内容',
        EMPTY_DIFF_RESULT_FROM_SIMPLE_GIT_DIFF: 'simple-git diff 返回空差异结果，尝试下一个方法...',
        USING_DIRECT_GIT_COMMAND_WITH_DIFF: '方法2: 正在尝试使用直接 git 命令获取文件差异...',
        SUCCESSFULLY_GOT_DIFF_USING_DIRECT_GIT_COMMAND: '使用直接 git 命令成功获取差异',
        EMPTY_DIFF_RESULT_FROM_DIRECT_GIT_COMMAND: '直接 git 命令返回空差异结果，尝试下一个方法...',
        USING_MANUAL_DIFF: '方法3: 正在尝试获取两个提交的文件内容并手动创建差异...',
        SUCCESSFULLY_CREATED_MANUAL_DIFF: '成功创建手动差异',
        COULD_NOT_CREATE_MANUAL_DIFF: '无法创建手动差异，文件内容不可用',
        ALL_METHODS_FAILED_TO_GET_FILE_DIFF: (allErrors: string): string => `获取文件差异的所有方法都失败了:\n${allErrors}`,
        ERROR_GETTING_FILE_DIFF: (error: string): string => `获取文件差异时出错: ${error}`,
        ERROR_GETTING_FILE_CONTENT: (error: string): string => `获取文件内容时出错: ${error}`,
        ERROR_GETTING_FILES_FOR_COMMIT: (error: string): string => `获取提交文件时出错: ${error}`,
        FALLBACK_METHOD_FAILED: (error: string): string => `备用方法也失败了: ${error}`,
        ERROR_GETTING_FILE_DIFF_WITH_SIMPLE_GIT: (error: string): string => `使用 simple-git diff 获取文件差异时出错: ${error}`,
        ERROR_GETTING_FILE_DIFF_WITH_DIRECT_COMMAND: (error: string): string => `使用直接 git 命令获取文件差异时出错: ${error}`,
        ERROR_CREATING_MANUAL_DIFF: (error: string): string => `创建手动差异时出错: ${error}`,
        GIT_NOT_INITIALIZED: 'Git 未初始化',
        FAILED_TO_GET_COMMITS: '获取提交失败',
        FAILED_TO_GET_COMMIT: '获取单个提交失败',
        FAILED_TO_GET_BRANCHES: '获取分支失败',
        ERROR_GETTING_COMMIT_BY_ID_WITH_DIRECT_COMMAND: (error: string): string => `使用直接命令获取提交ID时出错: ${error}`,
        FAILED_TO_SET_REPOSITORY: '设置仓库失败',
        ERROR_GETTING_COMMIT_FILES: '获取提交文件时出错',
        ERROR_CHECKING_GIT_REPOSITORY: '检查是否为 Git 仓库时出错',
        ERROR_GETTING_COMMIT_FILE_CONTENT: (file: string): string => `获取文件内容时出错: ${file}`,
        GETTING_COMMITS_WITH_FILTER: (filter: string): string => `使用过滤器获取提交: ${filter}`,
        RETURNING_CACHED_COMMITS: (count: number): string => `返回 ${count} 个缓存的提交`,
        GOT_COMMITS_SIMPLE_GIT: (count: number): string => `使用 simple-git 获取到 ${count} 个提交`,
        ERROR_GETTING_COMMITS_SIMPLE_GIT: '使用 simple-git 获取提交时出错',
        TRYING_GET_COMMITS_DIRECT: '尝试使用直接 git 命令获取提交...',
        GOT_COMMITS_DIRECT: (count: number): string => `使用直接 git 命令获取到 ${count} 个提交`,
        ERROR_GETTING_COMMITS: '获取提交时出错',
        GETTING_COMMIT_BY_ID: (commitId: string): string => `正在获取提交，ID: ${commitId}`,
        FOUND_COMMIT_IN_CACHE: (commitId: string): string => `在缓存中找到提交 ${commitId}`,
        TRYING_GET_COMMIT_SIMPLE_GIT: '尝试使用 simple-git 获取提交...',
        ERROR_GETTING_COMMIT_SIMPLE_GIT: '使用 simple-git 获取提交时出错',
        TRYING_GET_COMMIT_DIRECT: '尝试使用直接 git 命令获取提交...',
        ERROR_GETTING_COMMIT_BY_ID: '获取提交ID时出错',
        GETTING_BRANCHES: '获取分支',
        TRYING_GET_BRANCHES_SIMPLE_GIT: '尝试使用 simple-git 获取分支...',
        ERROR_GETTING_BRANCHES_SIMPLE_GIT: '使用 simple-git 获取分支时出错',
        TRYING_GET_BRANCHES_DIRECT: '尝试使用直接 git 命令获取分支...',
        ERROR_GETTING_BRANCHES: '获取分支时出错'
    },
    COMMIT_EXPLORER: {
        NO_WORKSPACE_FOLDER: '未打开工作区文件夹',
        NO_WORKSPACE_DESCRIPTION: '请打开一个 Git 仓库文件夹',
        USING_REPOSITORY_PATH: (path: string): string => `使用仓库路径: ${path}`,
        FETCHING_COMMITS: '正在从仓库获取提交...',
        REPOSITORY_SET_SUCCESS: '仓库设置成功',
        ERROR_SETTING_REPOSITORY: (error: string): string => `设置仓库时出错: ${error}`,
        FOUND_COMMITS: (count: string): string => `找到 ${count} 个提交`,
        ERROR_FETCHING_COMMITS: (error: string): string => `获取提交时出错: ${error}`,
        ERROR_GET_CHILDREN: (error: string): string => `getChildren 中出错: ${error}`,
        NO_COMMITS_FOUND: '未找到提交',
        NO_COMMITS_DESCRIPTION: '尝试不同的仓库或分支',
        LOADING: '正在加载提交...',
        LOADING_DESCRIPTION: '请稍候...',
        ERROR_PREFIX: (message: string): string => `错误: ${message}`,
        ERROR_DESCRIPTION: '详情请查看控制台'
    },
    FILE_EXPLORER: {
        NO_COMMIT_SELECTED: 'FileExplorerProvider 中未选择提交',
        COMMIT_NO_FILES: (hash: string): string => `选中的提交 ${hash} 没有文件`,
        SHOWING_FILES: (count: string, hash: string): string => `FileExplorerProvider: 显示提交 ${hash} 的 ${count} 个文件`,
        NO_WORKSPACE_FOLDER: '未打开工作区文件夹',
        REPOSITORY_PATH_UNDEFINED: '仓库路径未定义',
        ERROR_INITIALIZING_GIT: (error: string): string => `初始化 Git 服务时出错: ${error}`,
        COMMIT_FILES: (files: string): string => `提交文件: ${files}`,
        FILE_PATH_AND_INFO: (path: string, info: string): string => `文件路径: ${path}, 文件信息: ${info}`,
        CREATING_FILE_TREE_ITEM: (path: string, status: string): string => `正在为: ${path} 创建文件树项目, 状态: ${status}`
    },
    FILE: {
        FILE_OPEN: '已打开文件:',
        FILE_NEW_REVIEW: '为文件创建新的审查:',
        FILE_NOT_FOUND: '提交中未找到文件',
        FILE_FOUND_TO_REVIEW: '找到待审查文件',
        FILE_REVIEWING: '正在审查文件...',
        FILE_DIFF_ERROR: '无法生成差异内容',
        NO_FILES: '未找到要审查的文件',
        FILES_TO_REVIEW: '待审查文件数量:',
        OPEN_FILE: '打开文件:',
        NEW_REVIEW: '创建新审查:',
        NOT_FOUND: (path: string): string => `未找到文件: ${path}`,
        READING_ERROR: (path: string): string => `读取文件错误: ${path}`,
        WRITING_ERROR: (path: string): string => `写入文件错误: ${path}`
    },
    PROCESS: {
        PROC_BATCH: (batch: number, total: number): string => `正在处理批次 ${batch}/${total}`,
        PROC_FILES: (processed: number, total: number): string => `已处理 ${processed}/${total} 个文件`,
        PROC_AI_ANALYSIS: (filePath: string): string => `正在对 ${filePath} 执行 AI 分析...`,
        PROC_COMMENT_ADD: '已添加文件评论',
        PROC_AI_SUGGEST: '已添加 AI 建议到文件',
        PROC_QUALITY_SCORE: '已设置文件代码质量分数',
        CONSTRUCTOR_CALLED: '已初始化服务:',
        SET_QUALITY_SCORE: '设置质量分数:',
        ADD_COMMENT: '添加评论:',
        ESTIMATED_TIME_REMAINING: '预计剩余时间'
    },
    REPORT: {
        REPORT_GENERATE: '正在生成代码审查报告...',
        REPORT_SAVE: '正在保存审查数据...',
        REVIEW_DATA_SAVED_IN_MEMORY: '正在内存中保存审查数据...',
        REPORT_COMPLETE: '报告生成完成，耗时',
        GENERATE_REPORT: '正在生成审查报告...',
        GENERATE_REPORT_FOR_COMMIT: (commitId: string): string => `正在为提交 ${commitId} 生成审查报告...`,
        AI_ANALYSIS_PROGRESS: (current: number, total: number, percentage: number): string => `AI 分析进度: ${current}/${total} 文件 (${percentage.toFixed(1)}%) `,
        REPORT_GENERATION_PROGRESS: (current: number, total: number, percentage: number): string => `报告生成进度: ${current}/${total} 文件 (${percentage.toFixed(1)}%)`,
        REPORT_COMPLETED: (seconds: number): string => `报告生成完成，耗时 ${seconds.toFixed(1)} 秒`,
        REPORT_GENERATED_FOR_COMMIT: (commitId: string): string => `已为提交 ${commitId} 生成报告`,
        REPORT_SAVED_TO: (filePath: string): string => `报告已保存至: ${filePath}`
    },
    COMMON: {
        MSG_DETAILS: '详细信息:',
        SECONDS: '秒',
        FILE_PREFIX: '文件-'
    },
    MODEL: {
        UNSUPPORTED_MODEL_TYPE: (type: string): string => `不支持的模型类型: ${type}`,
        API_ERROR: (message: string): string => `API错误: ${message}`,
        VALIDATION_FAILED: 'API 密钥验证失败',
        MISSING_API_KEY: 'API 密钥未配置',
        API_KEY_VALIDATION_ERROR: 'API 密钥验证错误'
    },
    DEBUG: {
        EXTENSION_ACTIVE: '代码审查扩展现已激活',
        REVIEWING_CODE: '正在审查代码：',
        GENERATING_REPORT: '扩展：正在为提交生成报告',
        SETTING_REPO_PATH: '设置仓库路径:',
        USING_EXISTING_REPO: '使用已有仓库:',
        ERROR_DETAILS: '代码审查错误详情:'
    }
};

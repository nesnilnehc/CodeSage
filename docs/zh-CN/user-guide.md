# CodeSage 用户指南

## 快速开始

1. 从 VS Code 扩展商店安装 CodeSage
2. 打开命令面板（`Ctrl+Shift+P` 或 `Cmd+Shift+P`）
3. 运行 `CodeSage: Configure API Key` 设置 DeepSeek API 密钥
4. 从活动栏打开代码审查侧边栏
5. 选择提交并点击"开始代码审查"

## 主要功能

- **AI 驱动的代码审查**：使用 DeepSeek R1 模型
- **Git 提交历史分析**：支持提交历史浏览和分析
- **文件变更检测**：自动检测和分析文件差异
- **详细的审查报告**：提供可操作的改进建议

## 配置说明

1. DeepSeek API 密钥：
   - 在命令面板中运行 `CodeSage: Configure API Key`
   - 按提示输入 API 密钥

2. 语言设置：
   - 默认：中文
   - 可在设置中切换为英文

3. AI 模型：
   - 当前支持的模型：DeepSeek R1

## 可用命令

- `CodeSage: Start Code Review` - 开始审查选中的提交
- `CodeSage: Configure API Key` - 设置 API 密钥
- `CodeSage: Select AI Model` - 选择 AI 模型
- `CodeSage: Generate Report` - 生成审查报告
- `CodeSage: Filter by Date Range` - 按日期筛选提交
- `CodeSage: Filter by Commit ID` - 按提交 ID 筛选
- `CodeSage: Filter by Branch` - 按分支筛选提交

## 审查流程

1. 打开代码审查侧边栏
2. 从列表中选择提交
3. 点击"开始代码审查"或使用命令面板
4. 在审查面板中查看结果
5. 需要时生成并导出报告

## 需要帮助？

- 在 [GitHub](https://github.com/nesnilnehc/CodeSage/issues) 上报告问题
- 查看项目文档获取更多信息

## 即将推出

- 更多语言支持
- 自定义审查规则
- 团队协作功能
- 评论系统
- 更多 AI 模型支持

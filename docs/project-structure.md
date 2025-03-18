# CodeSage 项目结构与命名规范

## 项目概述

CodeSage 是一个 VS Code 扩展，利用 AI 技术（基于 DeepSeek 模型）提供 Git 提交代码审查功能。该扩展支持中文和英文界面，可以分析代码变更并提供高质量的代码审查报告。

## 目录结构

```
CodeSage/
├── .vscode/                  # VS Code 配置文件
├── dist/                     # 编译后的分发文件
├── docs/                     # 项目文档
│   ├── en/                   # 英文文档
│   ├── zh-CN/                # 中文文档
│   ├── project-structure.md  # 项目结构文档
│   └── release-guide.md      # 发布指南
├── node_modules/             # npm 依赖
├── resources/                # 资源文件（图标等）
├── src/                      # 源代码
│   ├── config/               # 配置相关代码
│   ├── core/                 # 核心功能模块
│   ├── extension.ts          # 扩展入口文件
│   ├── i18n/                 # 国际化资源
│   │   ├── en/               # 英文资源
│   │   │   └── prompts.ts    # 英文提示模板
│   │   ├── zh/               # 中文资源
│   │   │   └── prompts.ts    # 中文提示模板
│   │   └── index.ts          # 国际化入口
│   ├── models/               # 数据模型定义
│   ├── services/             # 服务层（API 调用等）
│   │   └── aiService.ts      # AI 服务实现
│   ├── ui/                   # 用户界面组件
│   └── utils/                # 工具函数
├── .gitignore                # Git 忽略配置
├── .markdownlint.yaml        # Markdown 检查配置
├── .prettierrc.yaml          # 代码格式化配置
├── CHANGELOG.md              # 变更记录
├── LICENSE                   # 许可证文件
├── package.json              # 项目依赖配置
├── README.md                 # 项目说明
├── tsconfig.json             # TypeScript 配置
└── webpack.config.js         # Webpack 配置
```

## 命名规范

### 1. 文件与文件夹命名

- **文件夹命名**：使用 camelCase（小驼峰式命名法），例如 `codeReview`、`fileUtils`
- **TypeScript/JavaScript 文件**：使用 camelCase，例如 `gitService.ts`、`fileUtils.ts`
- **特殊文件**：入口文件使用全小写，例如 `extension.ts`、`index.ts`
- **资源文件**：使用连字符（kebab-case），例如 `icon-dark.svg`
- **文档文件**：使用连字符，例如 `project-structure.md`

### 2. 代码命名

- **类名**：使用 PascalCase（大驼峰式命名法），例如 `GitService`、`CommitExplorer`
- **接口名**：使用 PascalCase 并以 `I` 开头，例如 `ICommit`、`IFileChange`
- **类型名**：使用 PascalCase，例如 `CommitData`、`ReviewResult`
- **枚举名**：使用 PascalCase，例如 `ModelType`、`ReviewLevel`
- **变量名**：使用 camelCase，例如 `commitList`、`fileChanges`
- **常量名**：使用全大写加下划线，例如 `API_BASE_URL`、`MAX_FILE_SIZE`
- **函数名**：使用动词开头的 camelCase，例如 `getCommits()`、`reviewCode()`

### 3. CSS 命名

- 使用连字符（kebab-case），例如 `.review-panel`、`.commit-item`

## 编码规范

1. **字符编码**
   - 所有代码文件必须使用 UTF-8 编码

2. **语言混合**
   - 中英文混合时，两种语言之间必须保留一个英文空格
   - 例如："代码审查 (Code Review)" 而非 "代码审查(Code Review)"

3. **TypeScript 规范**
   - 启用严格编译选项 (`strict: true`)
   - 使用最新的 TypeScript 特性
   - 使用类型注解，避免使用 `any` 类型
   - 使用接口定义数据结构
   - 使用枚举代替字符串常量

4. **注释规范**
   - 类和接口使用 JSDoc 风格的注释
   - 复杂函数应添加描述性注释
   - 使用 `// TODO: ` 标记待完成的工作

5. **代码格式**
   - 使用 Prettier 进行代码格式化
   - 缩进使用 2 个空格
   - 每行最大长度为 100 字符

## 最佳实践

1. **模块化**
   - 每个文件应只实现单一功能或特性
   - 将相关功能分组到同一目录下

2. **代码质量**
   - 使用 ESLint 进行代码质量检查
   - 对关键功能编写单元测试

3. **大文件处理**
   - 对大型文件使用压缩和摘要技术
   - 实现文件内容摘要化，包括文件头部、统计信息、采样行和文件尾部

4. **国际化**
   - 所有用户可见文本应使用 i18n 系统
   - 代码审查提示模板应位于对应语言的 prompts.ts 文件中

5. **版本控制**
   - 遵循语义化版本规范 (Semantic Versioning)
   - 在 CHANGELOG.md 中记录所有变更

## 依赖管理

- 使用 npm 作为包管理器
- 在 package.json 中指定确切的依赖版本
- 定期更新依赖以修复安全漏洞

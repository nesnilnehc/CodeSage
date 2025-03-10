# 变更日志

[English](CHANGELOG.en.md) | [简体中文](CHANGELOG.zh-CN.md)

本项目的所有重要变更都将在此文件中记录。

格式基于 [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)，
遵循 [Semantic Versioning](https://semver.org/spec/v2.0.0.html) 语义化版本规范。

## [0.2.0] - 2025-03-01

### 新增

- 批处理和并行审查功能，提高执行速度
- 增强的报告结构，提高可读性
- 审查过程中的详细进度通知

### 变更

- 优化代码审查过程，提高性能
- 改进错误处理和日志系统
- 重构 AI 分析过程，提高可靠性
- 增强通知管理器，提供更详细的更新

### 文档

- 添加专用语言版本的文档
- 重新组织文档结构，提高可维护性
- 更新 README 文件，增强多语言支持
- 改进用户和开发者指南

## [0.1.0] - 2025-02-28

### 新增

- CodeSage 扩展的初始版本
- 核心功能包括：
  - 提交浏览器，用于浏览和选择 Git 提交
  - 文件浏览器，用于查看已更改的文件
  - 基于 DeepSeek API 的 AI 驱动代码审查
  - 包含建议和质量评分的详细代码审查报告
  - 多语言支持（英语和中文）
- 配置选项：
  - DeepSeek API 密钥管理
  - AI 模型选择
  - 语言偏好设置
- 全面的文档：
  - README.md 中的用户指南
  - docs/release-guide.md 中的详细发布过程
  - 标准的 CHANGELOG.md

### 变更

- 从“AI Code Review”重新品牌为“CodeSage”：
  - 更新扩展名称和显示信息
  - 重新设计图标和视觉资产
  - 在所有组件中保持一致的品牌
- 代码改进：
  - 迁移到 TypeScript 以提高类型安全性
  - 增强错误处理和详细日志
  - 优化打包大小和性能
  - 改进代码组织和模块化
- 配置更新：
  - 将所有命令前缀重命名为 'codesage'
  - 简化配置键
  - 添加设置的类型定义

### 修复

- 增强错误处理和日志记录
- 改进 API 集成的可靠性
- 优化扩展打包
- 修复命令注册问题
- 解决依赖管理问题
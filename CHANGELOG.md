# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Enhanced AI model integration with support for newer LLM versions
- Support for custom review templates
- Performance metrics dashboard for review analytics

### Changed

- Improved file diff visualization
- Optimized memory usage during large repository scans
- Enhanced multilingual support with additional languages

### Fixed

- Resolved issue with Git integration on Windows platforms
- Fixed UI rendering problems in dark mode
- Addressed performance bottlenecks in large codebase reviews

## [0.2.0] - 2025-03-01

### Added

- Batch processing and parallel reviews for faster execution
- Enhanced report structure with improved readability
- Detailed progress notifications during review process

### Changed

- Optimized code review process for better performance
- Improved error handling and logging system
- Refactored AI analysis process for better reliability
- Enhanced notification manager with more detailed updates

### Documentation

- Added dedicated language-specific documentation
- Reorganized documentation structure for better maintainability
- Updated README with clearer multilingual support
- Improved user and developer guides

## [0.1.0] - 2025-02-28

### Added

- Initial release of CodeKarmic extension
- Core features including:
  - Commit Explorer for browsing and selecting Git commits
  - File Explorer for viewing changed files
  - AI-powered Code Review using DeepSeek API
  - Detailed code review reports with suggestions and quality scores
  - Multi-language support (English and Chinese)
- Configuration options:
  - DeepSeek API key management
  - AI model selection
  - Language preference settings
- Comprehensive documentation:
  - User guide in README.md
  - Detailed release process in docs/release-guide.md
  - Standard CHANGELOG.md

### Changed

- Rebranded from "AI Code Review" to "CodeKarmic":
  - Updated extension name and display information
  - Redesigned icon and visual assets
  - Consistent branding across all components
- Code improvements:
  - Migrated to TypeScript for better type safety
  - Enhanced error handling with detailed logging
  - Optimized bundle size and performance
  - Improved code organization and modularity
- Configuration updates:
  - Renamed all command prefixes to 'codekarmic'
  - Streamlined configuration keys
  - Added type definitions for settings

### Fixed

- Enhanced error handling and logging
- Improved API integration reliability
- Optimized extension packaging
- Fixed command registration issues
- Resolved dependency management problems
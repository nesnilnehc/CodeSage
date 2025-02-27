# AI Code Review Extension

A VS Code extension for Git commit code review that helps teams improve code quality through AI-powered code reviews. Works with any VS Code compatible editor.

## Features

- **Commit Explorer**: Browse and select Git commits by time range, commit ID, or branch
  - Filter commits by author, date range, or message content
  - View detailed commit information including hash, author, date, and message
  - Navigate commit history with pagination support

- **File Explorer**: View changed files in selected commits
  - See file modifications with additions and deletions counts
  - Group files by directory structure
  - Filter files by extension or change type (added, modified, deleted)

- **Code Review**: Review specific files with comments and AI suggestions
  - Side-by-side diff view for comparing changes
  - Add inline comments at specific lines
  - Track review status for each file
  - Collaborate with team members on reviews

- **AI Integration**: Leverage DeepSeek's AI for code analysis
  - Get concise, focused code improvement suggestions
  - Identify potential bugs or security issues
  - Receive clear explanations for complex code changes
  - Learn best practices through AI recommendations
  - Unique timestamp for each review session
  - Robust network retry mechanism (3 retries with 30s timeout)

- **Report Generation**: Create comprehensive code review reports
  - Export reviews as Markdown or HTML
  - Include summary statistics and key findings
  - Highlight critical issues and suggested improvements
  - Share reports with team members

## Requirements

- VS Code or any VS Code compatible editor
- Git repository
- DeepSeek API key

## Installation

### Option 1: Install from VS Code Marketplace

1. Open VS Code
2. Go to Extensions view (View -> Extensions)
3. Search for "AI Code Review"
4. Click Install
5. Configure your DeepSeek API key in settings

### Option 2: Build and Install from Source

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to build the extension
4. Run `npm run package-extension` to create the `.vsix` file
5. Install the generated `.vsix` file as described in Option 1

## Usage

1. Open a Git repository in VS Code
2. Click on the Code Review icon in the activity bar
3. Use the "Start Code Review" command to initialize the extension
4. Select a commit from the Commit Explorer
5. Choose a file to review from the File Explorer
6. Add comments or request AI review
7. Generate a report when finished

### Keyboard Shortcuts

- `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac): Start Code Review
- `Ctrl+Shift+C` (Windows/Linux) or `Cmd+Shift+C` (Mac): Add Comment at Current Line
- `Ctrl+Shift+A` (Windows/Linux) or `Cmd+Shift+A` (Mac): Request AI Review for Current File
- `Ctrl+Shift+G` (Windows/Linux) or `Cmd+Shift+G` (Mac): Generate Review Report

## Extension Settings

This extension contributes the following settings:

* `ai-code-review.deepseekApiKey`: Your DeepSeek API key
* `ai-code-review.selectedModel`: AI model to use (default: deepseek-r1)
* `ai-code-review.language`: Language for code review output (default: zh)
* `ai-code-review.maxCommits`: Maximum number of commits to display (default: 100)
* `ai-code-review.defaultTimeRange`: Default time range for commit filtering in days (default: 7)

## Known Issues

- Large repositories with many commits may experience performance issues
- Some complex merge commits may not display correctly in the diff view
- Report generation for very large reviews may be slow

## Frequently Asked Questions

### How do I filter commits by a specific author?

In the Commit Explorer view, use the filter icon and enter the author's name or email in the search field.

### Can I review commits from a specific branch?

Yes, use the branch selector dropdown in the Commit Explorer to switch between branches.

### How do I share my reviews with team members?

Generate a review report using the "Generate Report" button and share the exported file with your team.

### Does this extension work with remote repositories?

Yes, the extension works with both local and remote Git repositories.

### Can I customize the AI review criteria?

This feature will be available in a future update. Currently, the AI uses a standard set of code quality criteria.

## Release Notes

### 0.1.0

Initial release of Windsurf Code Review Extension

## Development

### Building the Extension

```bash
# Install dependencies
npm install

# Compile the extension
npm run compile

# Package the extension (creates .vsix file)
npm run package-extension
```

### Debugging the Extension

1. Open the extension project in Windsurf IDE
2. Press F5 to start debugging
3. This will launch a new Windsurf window with the extension loaded
4. You can set breakpoints in your code to debug

### Contributing

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin feature/my-new-feature`
5. Submit a pull request

## License

MIT

## Future Plans

We're actively working on enhancing the Windsurf Code Review Extension with the following features:

- **Real AI Integration**: Connect to Windsurf's AI Chat API for intelligent code analysis
- **Team Collaboration**: Enable multiple reviewers to work on the same code review
- **Custom Review Templates**: Create and save review templates for different types of code reviews
- **Integration with Issue Trackers**: Link reviews to issues in popular tracking systems

## Acknowledgements

- Thanks to the Windsurf IDE team for their excellent extension API
- This project uses [simple-git](https://github.com/steveukx/git-js) for Git integration

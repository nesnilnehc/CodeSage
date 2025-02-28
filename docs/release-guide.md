# CodeSage Release Guide

This guide covers the complete release process for CodeSage extension, including both GitHub Release and VS Code Marketplace publication.

## Release Process Overview

1. **GitHub Release** (Internal Testing)
2. **VS Code Marketplace Publication** (Public Release)
3. **Documentation Update & Promotion**

## Prerequisites

### 1. Setup Development Environment

- Node.js installed
- VS Code installed
- Git installed and configured
- GitHub CLI (`gh`) installed

### 2. Configure Access Tokens

1. Create Personal Access Token (PAT) for Azure DevOps:
   - Visit [Azure DevOps](https://dev.azure.com/)
   - Create new PAT with permissions:
     - Marketplace (Acquire)
     - Marketplace (Manage)
   - Save the token securely

1. Configure GitHub CLI:

```bash
gh auth login
```

1. Install and configure vsce:

```bash
npm install -g @vscode/vsce
vsce login <publisher-name>  # Use PAT when prompted
```

## Release Steps

### 1. Preparation

#### 1.1 Update Version

1. Update version in package.json:

```bash
npm version 0.1.0 --no-git-tag-version
```

#### 1.2 Update CHANGELOG.md

```markdown
## [0.1.0] - YYYY-MM-DD

### Added
- List new features

### Changed
- List changes

### Fixed
- List bug fixes
```

#### 1.3 Build and Test

```bash
# Install dependencies
npm install

# Build extension
npm run compile

# Run tests (if available)
npm test
```

### 2. GitHub Release (Internal Testing)

#### 2.1 Package Extension

```bash
npm run package-extension
```

This creates `codesage-<version>.vsix`

#### 2.2 Create GitHub Pre-release

```bash
gh release create v0.1.0 codesage-0.1.0.vsix \
  --title "CodeSage v0.1.0" \
  --notes-file CHANGELOG.md \
  --prerelease
```

#### 2.3 Internal Testing

1. Download .vsix from GitHub release
2. Install in VS Code:
   - View -> Command Palette
   - "Extensions: Install from VSIX"
3. Test all features
4. Document any issues

### 3. VS Code Marketplace Publication

#### 3.1 Publisher Setup

1. Visit [VS Code Marketplace Management](https://marketplace.visualstudio.com/manage)
2. Create or verify publisher account
3. Configure extension details

#### 3.2 Publish Extension

```bash
vsce publish
```

#### 3.3 Verify Publication

1. Visit [VS Code Marketplace](https://marketplace.visualstudio.com/)
2. Search for "CodeSage"
3. Verify:
   - Extension details
   - README content
   - Version number
   - Install count

### 4. Post-Release Tasks

#### 4.1 Update GitHub Release

1. Remove pre-release flag
2. Add Marketplace link
3. Update release notes

#### 4.2 Documentation

1. Update documentation with new features
2. Add installation instructions
3. Update API references (if any)

#### 4.3 Announcement

1. Post release notes
2. Update website
3. Notify users

## Troubleshooting

### Common Issues

#### Failed to Publish

1. Check PAT expiration
2. Verify publisher access
3. Check package.json configuration

#### Installation Issues

1. Verify VS Code version compatibility
2. Check extension dependencies
3. Review error logs

## Maintenance

### Version Management

- Follow semantic versioning
- Document breaking changes
- Keep changelog updated

### Support

- Monitor GitHub issues
- Respond to user feedback
- Plan future releases

## Quick Reference

### Important Commands

```bash
# Package extension
npm run package-extension

# Create GitHub release
gh release create v<version> <vsix-file> --notes-file CHANGELOG.md

# Publish to Marketplace
vsce publish
```

### Useful Links

- [VS Code Publishing Guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [GitHub Release Guide](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)
- [Semantic Versioning](https://semver.org/)

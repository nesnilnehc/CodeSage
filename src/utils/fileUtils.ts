import * as path from 'path';

/**
 * List of file types that can be code reviewed
 */
export const REVIEWABLE_FILE_EXTENSIONS = [
  // Code files
  '.ts', '.js', '.tsx', '.jsx', '.sql', '.java', '.py', '.rb', '.go', '.c', '.cpp', '.h', '.hpp', 
  '.cs', '.php', '.swift', '.kt', '.rs', '.scala', '.dart', '.groovy', '.sh', '.bash',
  '.html', '.css', '.scss', '.sass', '.less', '.json', '.yaml', '.yml', '.xml', '.vue',
  
  // Markdown documents
  '.md', '.markdown',
  
  // Configuration files
  '.gitignore', '.dockerignore',
  '.env', '.editorconfig',
  'Dockerfile', 'Makefile'
];

/**
 * Determine if a file needs code review
 * @param filePath File path
 * @returns Whether review is needed
 */
export function isReviewableFile(filePath: string): boolean {
  // Check for special files without extensions
  const basename = path.basename(filePath);
  if (REVIEWABLE_FILE_EXTENSIONS.includes(basename)) {
    return true;
  }
  
  // Check file extension
  const ext = path.extname(filePath).toLowerCase();
  return REVIEWABLE_FILE_EXTENSIONS.includes(ext);
}

/**
 * Get string description of file types that can be code reviewed
 * @returns Description of reviewable file types
 */
export function getReviewableFileTypesDescription(): string {
  const codeExts = REVIEWABLE_FILE_EXTENSIONS
    .filter(ext => ext !== '.md' && ext !== '.markdown')
    .join(', ');
    
  return `Code files (${codeExts}) and Markdown documents (.md, .markdown)`;
}

/**
 * 获取文件语言类型
 * @param filePath 文件路径
 * @returns 文件对应的语言类型
 */
export function getFileLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  
  // 映射文件扩展名到语言
  const extensionToLanguage: Record<string, string> = {
    '.ts': 'typescript',
    '.js': 'javascript',
    '.tsx': 'typescript',
    '.jsx': 'javascript',
    '.sql': 'sql',
    '.java': 'java',
    '.py': 'python',
    '.rb': 'ruby',
    '.go': 'go',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.php': 'php',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.rs': 'rust',
    '.scala': 'scala',
    '.dart': 'dart',
    '.groovy': 'groovy',
    '.sh': 'bash',
    '.bash': 'bash',
    '.html': 'html',
    '.css': 'css',
    '.scss': 'scss',
    '.sass': 'sass',
    '.less': 'less',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.xml': 'xml',
    '.vue': 'vue',
    '.md': 'markdown',
    '.markdown': 'markdown'
  };
  
  // 特殊文件名处理
  const basename = path.basename(filePath);
  if (basename === 'Dockerfile') return 'dockerfile';
  if (basename === 'Makefile') return 'makefile';
  if (basename === '.gitignore') return 'gitignore';
  if (basename === '.dockerignore') return 'dockerignore';
  if (basename === '.env') return 'env';
  if (basename === '.editorconfig') return 'editorconfig';
  
  // 返回映射结果或默认为纯文本
  return extensionToLanguage[ext] || 'plaintext';
}

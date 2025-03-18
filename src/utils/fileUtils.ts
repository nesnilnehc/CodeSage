import * as path from 'path';

/**
 * List of file types that can be code reviewed
 */
export const REVIEWABLE_FILE_EXTENSIONS = [
  // Code files
  '.ts', '.js', '.tsx', '.jsx', '.sql', '.java', '.py', '.rb', '.go', '.c', '.cpp', '.h', '.hpp', 
  '.cs', '.php', '.swift', '.kt', '.rs', '.scala', '.dart', '.groovy', '.sh', '.bash',
  '.html', '.css', '.scss', '.sass', '.less', '.json', '.yaml', '.yml', '.xml',
  
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

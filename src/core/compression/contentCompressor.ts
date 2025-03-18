/**
 * Content Compressor
 * 
 * This module provides intelligent content compression functionality,
 * using semantic analysis to retain key information while reducing content length.
 */

import { CompressionOptions, DEFAULT_COMPRESSION_OPTIONS, CompressionStats } from './compressionTypes';
import { Logger } from '../../utils/logger';

const logger = new Logger('ContentCompressor');

/**
 * Perform content compression
 * @param content Original text content
 * @param options Compression configuration options
 */
export function compressContent(
    content: string,
    options: Partial<CompressionOptions> = {}
): { compressed: string; stats: CompressionStats } {
    // Merge default options with provided options
    const opts: CompressionOptions = {
        ...DEFAULT_COMPRESSION_OPTIONS,
        ...options,
    };

    // Check if compression is needed
    if (content.length <= opts.maxContentLength) {
        return {
            compressed: content,
            stats: {
                originalSize: content.length,
                compressedSize: content.length,
                compressionRatio: 1,
                totalLines: content.split('\n').length,
                keptLines: content.split('\n').length,
                lineRetentionRate: 1,
            },
        };
    }

    // Split content into lines
    const lines = content.split('\n');
    const totalLines = lines.length;

    // Keep header and footer lines
    const headerLinesActual = Math.min(opts.headerLines, Math.floor(totalLines / 3));
    const footerLinesActual = Math.min(opts.footerLines, Math.floor(totalLines / 3));

    // Calculate middle section
    const middleStartIndex = headerLinesActual;
    const middleEndIndex = totalLines - footerLinesActual;
    const middleLines = lines.slice(middleStartIndex, middleEndIndex);
    
    // Intelligent sampling based on content importance and language detection
    const detectedLanguage = detectLanguage(content, opts.language);
    
    // Intelligent sampling based on content importance
    const importanceScore = (line: string): number => {
        let score = 0;
        
        // Non-empty lines score higher
        if (line.trim().length > 0) score += 1;
        
        // Language-specific scoring
        switch (detectedLanguage) {
            case 'javascript':
            case 'typescript':
                // Code structure indicators score higher
                if (/^(class|function|import|export|const|let|var|interface|type|enum)/.test(line)) score += 5;
                // Method definitions and arrow functions score higher
                if (/^\s+(public|private|protected|async|static|\*|\w+\s*\([^)]*\)\s*\{|\w+\s*=\s*\([^)]*\)\s*=>)/.test(line)) score += 3;
                // React hooks and components score higher
                if (/\b(use[A-Z]\w+|function\s+[A-Z]\w+|class\s+[A-Z]\w+\s+extends)\b/.test(line)) score += 4;
                // JSX/TSX elements score higher
                if (/^\s*<[A-Z]\w+|\breturn\s+</.test(line)) score += 3;
                // Vue components and directives score higher
                if (/^\s*(@Component|@Vue\.component|@Prop|@Watch|@Emit|v-\w+)/.test(line)) score += 4;
                // Vue lifecycle hooks score higher
                if (/^\s*(created|mounted|updated|destroyed|beforeCreate|beforeMount|beforeUpdate|beforeDestroy)\(/.test(line)) score += 3;
                // State management score higher
                if (/\b(useState|useReducer|useContext|mapState|mapGetters|mapActions|mapMutations)\b/.test(line)) score += 4;
                break;

            case 'css':
            case 'less':
            case 'sass':
            case 'scss':
                // Selectors and media queries score higher
                if (/^[.#]?[\w-]+|^@media\b|^@keyframes\b/.test(line)) score += 4;
                // Important properties score higher
                if (/^\s*(display|position|flex|grid|animation|transition|transform):\s/.test(line)) score += 3;
                // Variables and mixins score higher
                if (/^\s*(@include|@extend|@mixin|@function|\$\w+:|@\w+:|--\w+:)/.test(line)) score += 4;
                // Responsive design score higher
                if (/^\s*@(media|supports|container)\b/.test(line)) score += 4;
                // CSS-in-JS patterns score higher
                if (/^\s*(styled\.|css`|makeStyles|createStyles)/.test(line)) score += 3;
                break;
                
            case 'python':
                // Function and class definitions score higher
                if (/^(def|class|async\s+def)\s+\w+/.test(line)) score += 5;
                // Imports and decorators score higher
                if (/^(from|import|@\w+)/.test(line)) score += 4;
                // Special methods score higher
                if (/^\s+def\s+__\w+__/.test(line)) score += 4;
                // Control flow score higher
                if (/^\s*(if|elif|else|for|while|try|except|finally|with)\b/.test(line)) score += 2;
                break;
                
            case 'java':
            case 'kotlin':
                // Class, interface, and method definitions score higher
                if (/^\s*(public|private|protected)\s+(class|interface|enum|@interface)/.test(line)) score += 5;
                // Method definitions score higher
                if (/^\s*(public|private|protected|final|static|abstract)\s+[\w<>\[\]]+\s+\w+\s*\(/.test(line)) score += 4;
                // Annotations score higher
                if (/^\s*@\w+/.test(line)) score += 3;
                break;
                
            case 'cpp':
            case 'c':
                // Preprocessor directives score higher
                if (/^\s*#(include|define|ifdef|ifndef|endif|pragma)/.test(line)) score += 5;
                // Class and function definitions score higher
                if (/^\s*(class|struct|enum|namespace|template)\s+\w+/.test(line)) score += 5;
                // Function definitions score higher
                if (/^\s*[\w:]+\s+[\w:]+\s*\([^)]*\)\s*(const|noexcept|override|final)?\s*\{?$/.test(line)) score += 4;
                break;
                
            default: // Generic language mode
                // Code structure indicators score higher
                if (/^(class|function|def|import|export|const|let|var|interface|type|enum)/.test(line)) score += 5;
                // Method definitions score higher
                if (/^\s+(public|private|protected|async|static|\*)/.test(line)) score += 3;
                break;
        }
        
        // Important comments score higher (language-independent)
        if (/\b(TODO|FIXME|XXX|HACK|NOTE|IMPORTANT|BUG|OPTIMIZE|REVIEW)\b/.test(line)) score += 4;
        
        // Documentation comments score higher
        if (/^\s*(\*|#|\/\/|\/\*|\"\"\"|\'\'\'|\*)\s/.test(line)) score += 2;
        
        // Error handling score higher
        if (/\b(try|catch|except|finally|throw|throws|raise|rescue|error)\b/.test(line)) score += 3;
        
        // Complex logic score higher
        if (/\b(if|else|switch|case|for|while|do|foreach|map|filter|reduce)\b/.test(line)) score += 2;
        
        // Security-related code score higher
        if (/\b(auth|security|password|encrypt|decrypt|hash|token|permission|access)\b/i.test(line)) score += 3;
        
        return score;
    };

    // Score all middle lines
    const scoredLines = middleLines.map((line, index) => ({
        line,
        index: middleStartIndex + index,
        score: importanceScore(line),
    }));

    // Sort by importance score (highest first)
    scoredLines.sort((a, b) => b.score - a.score);

    // Select top percentage based on sample rate
    const samplesToTake = Math.ceil(middleLines.length * opts.sampleRate);
    const selectedLines = scoredLines.slice(0, samplesToTake);

    // Sort by original order for readability
    selectedLines.sort((a, b) => a.index - b.index);

    // Build compressed content
    let compressedContent = '';

    // Add header
    compressedContent += lines.slice(0, headerLinesActual).join('\n');
    
    // Add middle section with indicators
    if (selectedLines.length > 0) {
        compressedContent += '\n\n// ... Compressed Section ...';
        
        // Add selected middle lines
        for (const lineObj of selectedLines) {
            compressedContent += '\n' + lines[lineObj.index];
        }
        
        // Add footer
        compressedContent += '\n\n// ... End of File ...';
        compressedContent += '\n' + lines.slice(middleEndIndex).join('\n');
    } else {
        // If no lines selected, directly add footer
        compressedContent += '\n\n// ... End of File ...';
        compressedContent += '\n' + lines.slice(middleEndIndex).join('\n');
    }
    
    // Create statistics
    const compressedLines = compressedContent.split('\n');
    
    // Calculate statistics
    const keptLines = compressedLines.length;
    const stats: CompressionStats = {
        originalSize: content.length,
        compressedSize: compressedContent.length,
        compressionRatio: compressedContent.length / content.length,
        totalLines,
        keptLines,
        lineRetentionRate: keptLines / totalLines,
    };
    
    // If statistics should be included, add them to the top of compressed content
    if (opts.includeStats) {
        const statsHeader = [
            '',
            '--- File Statistics ---',
            `Total Lines: ${totalLines}`,
            `File Size: ${content.length} characters`,
            `Detected Language: ${detectedLanguage}`,
            `Compression Rate: ${Math.round((1 - stats.compressionRatio) * 100)}%`,
            ''
        ].join('\n');
        
        compressedContent = statsHeader + compressedContent;
    }

    logger.debug(`Content compression: ${totalLines} lines -> ${keptLines} lines (retention rate: ${Math.round(stats.lineRetentionRate * 100)}%)`);
    
    return { compressed: compressedContent, stats };
}

/**
 * Detect programming language of the content
 * @param content Content to detect language from
 * @param specifiedLanguage Specified language, auto-detect if set to 'auto'
 * @returns Detected language
 */
export function detectLanguage(content: string, specifiedLanguage: string = 'auto'): string {
    if (specifiedLanguage !== 'auto') return specifiedLanguage;
    
    // Simple language detection based on file patterns
    const jsPatterns = /\b(function|const|let|var|import\s+from|export|=>|React|useState|useEffect)\b/;
    const tsPatterns = /\b(interface|type|namespace|enum|<[\w\s]+>|: \w+)\b/;
    const pyPatterns = /\b(def|class|import\s+\w+|from\s+\w+\s+import|if\s+__name__\s*==\s*['"]__main__['"])\b/;
    const javaPatterns = /\b(public|private|protected|class|interface|extends|implements|@Override)\b/;
    const cppPatterns = /\b(#include|namespace|template|std::|->|::|public:|private:|protected:)\b/;
    const rustPatterns = /\b(fn|impl|struct|enum|trait|pub|mut|let|match|use\s+\w+::|->)\b/;
    const goPatterns = /\b(func|package|import|type|struct|interface|go|chan|defer|goroutine)\b/;
    const rubyPatterns = /\b(def|class|module|require|include|attr_|end)\b/;
    const phpPatterns = /\b(function|class|namespace|use\s+\w+;|\$\w+|->|::)\b/;
    const csharpPatterns = /\b(namespace|class|interface|enum|public|private|protected|using|async|await|get|set|var|new|void)\b/;
    const sqlPatterns = /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|PROCEDURE|FUNCTION|TRIGGER|VIEW|INDEX|CONSTRAINT|WHERE|FROM|JOIN)\b/i;
    const vuePatterns = /\b(Vue|createApp|defineComponent|ref|reactive|computed|watch|onMounted|setup|v-model|v-if|v-for|v-on|v-bind|template)\b/;
    const reactPatterns = /\b(React|useState|useEffect|useContext|useReducer|useRef|useMemo|useCallback|<[A-Z][\w.]*|<React.Fragment|<>|<\/\w+>)\b/;
    const cssPatterns = /\b(@media|@keyframes|@import|@font-face|@supports|@layer|:root|var\(|calc\(|--[\w-]+|\.[\w-]+|#\w+)\b/;
    const sassPatterns = /\b(@include|@extend|@mixin|@function|@if|@else|@for|@each|@while|\$[\w-]+|&:|&\.|&\[)\b/;
    
    const contentSample = content.slice(0, Math.min(content.length, 5000));
    
    if (tsPatterns.test(contentSample)) return 'typescript';
    if (jsPatterns.test(contentSample)) return 'javascript';
    if (vuePatterns.test(contentSample)) return 'vue';
    if (reactPatterns.test(contentSample)) return 'react';
    if (sassPatterns.test(contentSample)) return 'sass';
    if (cssPatterns.test(contentSample)) return 'css';
    if (pyPatterns.test(contentSample)) return 'python';
    if (javaPatterns.test(contentSample)) return 'java';
    if (cppPatterns.test(contentSample)) return 'cpp';
    if (rustPatterns.test(contentSample)) return 'rust';
    if (goPatterns.test(contentSample)) return 'go';
    if (rubyPatterns.test(contentSample)) return 'ruby';
    if (phpPatterns.test(contentSample)) return 'php';
    if (csharpPatterns.test(contentSample)) return 'csharp';
    if (sqlPatterns.test(contentSample)) return 'sql';
    
    return 'generic';
}

/**
 * Calculate content fingerprint/hash for caching and file version comparison
 * @param content Content to analyze
 * @param language Optional language hint for better analysis
 * @returns Object containing key fingerprint metrics
 */
export function calculateContentFingerprint(content: string, language: string = 'auto'): Record<string, number | string> {
    const lines = content.split('\n');
    
    // Detect language (if not specified)
    const detectedLang = detectLanguage(content, language || 'auto');
    
    // Calculate line metrics
    const totalLines = lines.length;
    const nonEmptyLines = lines.filter(line => line.trim().length > 0).length;
    
    // Calculate token metrics
    const tokens = content
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(token => token.length > 0);
    const totalTokens = tokens.length;
    
    // Language-specific metrics
    const metrics: Record<string, number> = {};
    
    switch (detectedLang) {
        case 'javascript':
        case 'typescript':
            metrics['imports'] = (content.match(/import\s+.*\bfrom\b/g) || []).length;
            metrics['exports'] = (content.match(/export\s+/g) || []).length;
            metrics['functions'] = (content.match(/\b(function\s+\w+|\w+\s*=\s*\([^)]*\)\s*=>)/g) || []).length;
            metrics['classes'] = (content.match(/\bclass\s+\w+/g) || []).length;
            metrics['hooks'] = (content.match(/\buse[A-Z]\w+/g) || []).length;
            metrics['jsx'] = (content.match(/<[A-Z]\w+/g) || []).length;
            break;
            
        case 'python':
            metrics['imports'] = (content.match(/^\s*(import|from)\s+\w+/gm) || []).length;
            metrics['functions'] = (content.match(/^\s*def\s+\w+/gm) || []).length;
            metrics['classes'] = (content.match(/^\s*class\s+\w+/gm) || []).length;
            metrics['decorators'] = (content.match(/^\s*@\w+/gm) || []).length;
            metrics['specialMethods'] = (content.match(/^\s*def\s+__\w+__/gm) || []).length;
            break;
            
        case 'java':
        case 'kotlin':
            metrics['imports'] = (content.match(/^\s*import\s+[\w.]+/gm) || []).length;
            metrics['classes'] = (content.match(/^\s*(public|private|protected)\s+class\s+\w+/gm) || []).length;
            metrics['methods'] = (content.match(/^\s*(public|private|protected)\s+[\w<>\[\]]+\s+\w+\s*\(/gm) || []).length;
            metrics['annotations'] = (content.match(/^\s*@\w+/gm) || []).length;
            break;
            
        case 'cpp':
        case 'c':
            metrics['includes'] = (content.match(/^\s*#include\s*[<"]\w+[>"]\s*$/gm) || []).length;
            metrics['classes'] = (content.match(/^\s*class\s+\w+/gm) || []).length;
            metrics['functions'] = (content.match(/^\s*[\w:]+\s+[\w:]+\s*\([^)]*\)\s*(const|noexcept|override|final)?\s*\{?$/gm) || []).length;
            metrics['templates'] = (content.match(/^\s*template\s*<[^>]+>/gm) || []).length;
            break;
            
        case 'csharp':
            metrics['usings'] = (content.match(/^\s*using\s+[\w.]+;/gm) || []).length;
            metrics['namespaces'] = (content.match(/^\s*namespace\s+[\w.]+/gm) || []).length;
            metrics['classes'] = (content.match(/^\s*(public|private|protected|internal)?\s*(static|sealed|abstract)?\s*class\s+\w+/gm) || []).length;
            metrics['interfaces'] = (content.match(/^\s*(public|private|protected|internal)?\s*interface\s+I\w+/gm) || []).length;
            metrics['methods'] = (content.match(/^\s*(public|private|protected|internal)\s+(static|virtual|override|abstract)?\s*[\w<>\[\]]+\s+\w+\s*\(/gm) || []).length;
            metrics['properties'] = (content.match(/^\s*(public|private|protected|internal)\s+(static|virtual|override|abstract)?\s*[\w<>\[\]]+\s+\w+\s*\{\s*(get|set)/gm) || []).length;
            metrics['attributes'] = (content.match(/^\s*\[\w+/gm) || []).length;
            break;
            
        case 'sql':
            metrics['tables'] = (content.match(/\bCREATE\s+TABLE\s+[\w\[\]"`.]+ /gi) || []).length;
            metrics['views'] = (content.match(/\bCREATE\s+VIEW\s+[\w\[\]"`.]+ /gi) || []).length;
            metrics['procedures'] = (content.match(/\bCREATE\s+(PROC|PROCEDURE)\s+[\w\[\]"`.]+ /gi) || []).length;
            metrics['functions'] = (content.match(/\bCREATE\s+FUNCTION\s+[\w\[\]"`.]+ /gi) || []).length;
            metrics['triggers'] = (content.match(/\bCREATE\s+TRIGGER\s+[\w\[\]"`.]+ /gi) || []).length;
            metrics['selects'] = (content.match(/\bSELECT\s+/gi) || []).length;
            metrics['inserts'] = (content.match(/\bINSERT\s+INTO\s+/gi) || []).length;
            metrics['updates'] = (content.match(/\bUPDATE\s+[\w\[\]"`.]+ \s+SET\s+/gi) || []).length;
            metrics['deletes'] = (content.match(/\bDELETE\s+FROM\s+/gi) || []).length;
            break;
            
        default:
            metrics['imports'] = (content.match(/import\s+/g) || []).length;
            metrics['exports'] = (content.match(/export\s+/g) || []).length;
            metrics['functions'] = (content.match(/function\s+\w+/g) || []).length;
            metrics['classes'] = (content.match(/class\s+\w+/g) || []).length;
    }
    
    // Calculate code/comment ratio
    const commentLines = lines.filter(line => /^\s*(\/\/|\/\*|\*|#)/.test(line)).length;
    const codeCommentRatio = nonEmptyLines > 0 ? (nonEmptyLines - commentLines) / nonEmptyLines : 1;
    
    // Calculate content hash (simple)
    const contentHash = Array.from(content)
        .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 2147483647, 0)
        .toString(16);
    
    return {
        language: detectedLang,
        totalLines,
        nonEmptyLines,
        totalTokens,
        commentLines,
        codeCommentRatio,
        contentHash,
        ...metrics
    };
}

/**
 * Provide a simple string hash version for backward compatibility
 * @param content Content to hash
 * @returns Hash string
 */
export function getSimpleContentFingerprint(content: string): string {
    // Simple implementation: use content length and hash of front/back portions
    const prefix = content.substring(0, Math.min(100, content.length));
    const suffix = content.substring(Math.max(0, content.length - 100));
    
    // Create a simple hash
    let hash = 0;
    const sample = prefix + suffix + content.length;
    
    for (let i = 0; i < sample.length; i++) {
        const char = sample.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    
    return hash.toString(16);
}

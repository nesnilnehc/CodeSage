export const PROMPTS = {
    CODE_REVIEW_BASE: (content: string, diffContent: string): string => `Please perform a comprehensive review of the following code file, with special attention to the changed parts.\n\nComplete file content:\n${content}\n\nDiff content:\n${diffContent}\n\nPlease reply in the following format:\n---FULL ANALYSIS---\n(Analysis and suggestions for the entire file)\n\n---DIFF ANALYSIS---\n(Specific analysis and suggestions for the changed parts)\n\n---OVERALL SUGGESTIONS---\n(Combined suggestions based on both analyses)\n\n---SCORE---\n(Score from 1-10, where 10 is the highest)`,
    SYSTEM_ROLE: "You are a professional code review expert. Please analyze the code comprehensively, focus on the changes, and provide specific improvement suggestions.",
    ANALYSIS_SECTIONS: {
        FULL: "---FULL ANALYSIS---",
        DIFF: "---DIFF ANALYSIS---",
        SUGGESTIONS: "---OVERALL SUGGESTIONS---",
        SCORE: "---SCORE---"
    },
    CODE_REVIEW_TEMPLATES: {
        SYSTEM_PROMPT: `You are a code review expert. Please follow this template for code review:

1. Basic Information
- Submitter
- Submit Time
- Commit ID
- Commit Message

2. Code Quality Assessment
- Code Structure and Organization
- Implementation
- Performance Considerations
- Security

3. Specific Issues
For each issue found, clearly indicate the relevant line numbers and concisely analyze key issues.`,

        DIFF_SYSTEM_PROMPT: 'You are a code review expert specializing in analyzing code changes. Please reply in English with improvement suggestions. Each suggestion MUST start with "[line] " (e.g., "[123] suggestion content"), if multiple lines are involved, you can use a range (e.g., "[123-125] suggestion content"). If you cannot determine specific line numbers, you may use descriptive language to indicate the location.',

        DIFF_PROMPT: (filePath: string, diffContent: string): string => `Please review the following code changes in detail, focusing on potential issues and improvement opportunities.
File: ${filePath}
Changes:
${diffContent}

Please list improvement suggestions directly.`,

        FULL_FILE_PROMPT: (filePath: string, fileType: string, content: string): string => `Please review the following code according to the code review template:

File: ${filePath} ${fileType}
Code Content:
${content}

Please focus on:
1. Code Structure and Organization
   - File structure rationality
   - Module division clarity
   - Code layering appropriateness
   - Dependency relationships

2. Implementation
   - Naming conventions
   - Code complexity
   - Code duplication
   - Comment completeness
   - Exception handling
   - Boundary condition handling

3. Performance Considerations
   - Algorithm efficiency
   - Resource usage
   - Concurrency handling
   - Memory management
   - Compression techniques for large files

4. Security
   - Input validation
   - Access control
   - Sensitive information handling
   - Security vulnerability prevention

For each issue, please provide suggestions in the following format:
[line number] Issue description and improvement suggestion`,

        LARGE_FILE_PROMPT: (filePath: string, fileType: string, contentSummary: string): string => `Please review the following large code file using its summarized content. Due to the file size, a compressed summary is provided:

File: ${filePath} ${fileType}
Code Summary:
${contentSummary}

Focus on the high-level structure, patterns, and potential issues visible from this summary. 
Consider efficient algorithms, memory usage, and appropriate compression techniques when applicable.

Please provide recommendations for:
1. Overall architecture and design patterns
2. Potential performance optimizations
3. Code organization improvements
4. Any apparent issues or anti-patterns

For each issue, please provide suggestions in the following format:
[section] Issue description and improvement suggestion`,

        FINAL_PROMPT: (diffSuggestions: string[], fullFileSuggestions: string[]): string => `Based on the following two sets of suggestions, provide final comprehensive suggestions and a score.

Diff suggestions:
${diffSuggestions.map((s: string) => `- ${s}`).join('\n')}

Full file suggestions:
${fullFileSuggestions.map((s: string) => `- ${s}`).join('\n')}

Please reply in the following format:
---OVERALL SUGGESTIONS---
(Your combined suggestions from both analyses)

---SCORE---
(Score from 1-10, where 10 is excellent code quality)`
    }
};

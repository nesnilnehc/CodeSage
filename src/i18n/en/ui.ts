export const UI = {
    BUTTONS: {
        REVIEW: 'Review Code',
        ADD_COMMENT: 'Add Comment',
        REQUEST_AI_REVIEW: 'Request AI Review',
        GENERATE_REPORT: 'Generate Report',
        CONFIGURE_API_KEY: 'Configure API Key',
        OPEN_SETTINGS: 'Open Settings'
    },
    TABS: {
        COMMENTS: 'Comments',
        AI_SUGGESTIONS: 'AI Suggestions',
        ADD_COMMENT: 'Add Comment'
    },
    PLACEHOLDERS: {
        COMMENT: 'Enter your comment here...',
        LINE_NUMBER: 'Line number',
        API_KEY: 'Enter your API key',
        START_DATE: 'Enter start date (YYYY-MM-DD)',
        END_DATE: 'Enter end date (YYYY-MM-DD)',
        DATE_FORMAT: 'e.g. 2023-01-01',
        COMMIT_ID: 'Enter commit ID or hash prefix',
        COMMIT_ID_PREFIX: 'e.g. a1b2c3d',
        SELECT_BRANCH: 'Select a branch to filter commits',
        SELECT_MODEL: 'Select AI model for code review'
    },
    TITLES: {
        BRANCH_SELECTION: 'Branch Selection',
        MODEL_SELECTION: 'AI Model Selection'
    },
    MESSAGES: {
        NO_COMMENTS: 'No comments yet. Add a comment or request an AI review.',
        NO_AI_SUGGESTIONS: 'No AI suggestions yet. Click "Request AI Review" to analyze this file.',
        CODE_QUALITY_SCORE: (score: string): string => `Code Quality Score: ${score}/10`,
        INVALID_COMMENT: 'Please enter a comment',
        INVALID_LINE_NUMBER: 'Please enter a valid line number',
        NO_COMMIT_SELECTED: 'Please select a commit first',
        NO_WORKSPACE: 'No workspace folder open',
        NOT_GIT_REPO: 'The current workspace is not a Git repository',
        API_KEY_SUCCESS: 'API key configured successfully!',
        API_KEY_INVALID: 'Invalid API key. Please check your key and try again.',
        API_KEY_MISSING: 'API key not configured. Please configure your API key to use code review features.',
        ERROR_OPENING_PANEL: (error: string): string => `Error opening review panel: ${error}`,
        ERROR_GENERATING_REPORT: (error: string): string => `Error generating report: ${error}`,
        ERROR_START_REVIEW: (error: string): string => `Error starting review: ${error}`,
        ERROR_REVIEWING_CODE: (error: string): string => `Error reviewing code: ${error}`,
        REPORT_GENERATED: (hash: string): string => `Report generated for commit: ${hash}`,
        ERROR_FILTERING_COMMITS: (error: string): string => `Error filtering commits: ${error}`,
        ERROR_DATE_FILTER: (error: string): string => `Error setting date filter: ${error}`,
        ERROR_COMMIT_FILTER: (error: string): string => `Error setting commit ID filter: ${error}`,
        ERROR_BRANCH_FILTER: (error: string): string => `Error setting branch filter: ${error}`,
        ERROR_GIT_DEBUG: (error: string): string => `Error in Git debugging: ${error}`,
        REFRESHING_COMMITS: 'Refreshing commits...',
        COMMITS_REFRESHED: 'Refreshed commit list',
        FILES_REFRESHED: 'Refreshed file list',
        COMMIT_SELECTED: 'Selected commit',
        SELECT_COMMIT_FIRST: 'Please select a commit first',
        FILTERING_COMMITS: 'Filtering commits...',
        COMMITS_FILTERED: 'Filtered commits by date range',
        COMMITS_FILTERED_BY_ID: 'Filtered commits by ID',
        COMMITS_FILTERED_BY_BRANCH: 'Filtered commits by branch',
        CODE_REVIEW_STARTED: 'Code review started'
    },
    PANEL: {
        CODE_REVIEW_TITLE: (filePath: string): string => `Code Review: ${filePath}`,
        COMMIT_INFO: (hash: string, message: string): string => `Commit: ${hash} - ${message}`,
        AUTHOR_INFO: (author: string, date: string): string => `Author: ${author} - ${date}`
    }
};

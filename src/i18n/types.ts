/**
 * Available languages in the application
 */
export enum Language {
    ENGLISH = 'en',
    CHINESE = 'zh'
}

/**
 * 双语消息结构
 */
export interface BilingualMessage {
    zh: string;
    en: string;
}

// 语言显示名称映射
export const LanguageDisplayNames = {
    [Language.ENGLISH]: 'English',
    [Language.CHINESE]: '中文'
};

// 便捷的转换函数
export function getLanguageDisplayName(lang: Language): string {
    return LanguageDisplayNames[lang] || lang;
}

// 反向查询函数
export function getLanguageFromDisplayName(displayName: string): Language {
    for (const [key, value] of Object.entries(LanguageDisplayNames)) {
        if (value === displayName) return key as Language;
    }
    
    // 如果找不到匹配项，则返回默认语言
    return Language.ENGLISH;
}
import { EventEmitter } from 'events';
import { ConfigChangeEvent, AppConfig, Language as ConfigLanguage } from '../config/appConfig';
import { Language } from './types';

// Import English resources
import { UI as EN_UI } from './en/ui';
import { OUTPUT as EN_OUTPUT } from './en/output';
import { PROMPTS as EN_PROMPTS } from './en/prompts';

// Import Chinese resources
import { UI as ZH_UI } from './zh/ui';
import { OUTPUT as ZH_OUTPUT } from './zh/output';
import { PROMPTS as ZH_PROMPTS } from './zh/prompts';

/**
 * Internationalization event types
 */
export enum I18nEvent {
    LANGUAGE_CHANGED = 'languageChanged'
}

/**
 * Language configuration storage
 */
const LANGUAGE_CONFIG = {
  UI: {
    [Language.ENGLISH]: EN_UI,
    [Language.CHINESE]: ZH_UI
  },
  OUTPUT: {
    [Language.ENGLISH]: EN_OUTPUT,
    [Language.CHINESE]: ZH_OUTPUT
  },
  PROMPTS: {
    [Language.ENGLISH]: EN_PROMPTS,
    [Language.CHINESE]: ZH_PROMPTS
  }
};

/**
 * I18n Manager for handling translations and language changes
 * This module provides internationalization support for the application
 * with automatic fallback to English for missing translations
 */

/**
 * Creates a proxy that automatically handles fallbacks to English
 * for missing translations in other languages
 * @param source The source translation object
 * @param fallback The fallback translation object (English)
 */
function createTranslationProxy(source: any, fallback: any): any {
    return new Proxy(source, {
        get(target, prop) {
            const value = target[prop];
            
            // If the property doesn't exist in the target
            if (value === undefined) {
                return fallback[prop]; 
            }
            
            // If it's an object, create a nested proxy
            if (typeof value === 'object' && value !== null) {
                return createTranslationProxy(value, fallback[prop] || {});
            }
            
            return value;
        }
    });
}

/**
 * I18n Manager for handling translations and language changes
 */
class I18nManager {
    private static instance: I18nManager;
    private emitter: EventEmitter;
    private currentLanguage: Language;
    
    // Translation objects with fallback support
    private _UI: any;
    private _OUTPUT: any;
    private _PROMPTS: any;
    
    private constructor() {
        this.emitter = new EventEmitter();
        
        // Initialize with config or default to English
        const config = AppConfig.getInstance();
        const configLanguage = config.getLanguage();
        this.currentLanguage = configLanguage === 'ENGLISH' ? Language.ENGLISH : Language.CHINESE;
        
        // Initialize translation objects
        this.updateTranslations();
        
        // Listen for configuration changes
        config.onChange(ConfigChangeEvent.LANGUAGE, () => {
            const newConfigLanguage = config.getLanguage();
            this.currentLanguage = newConfigLanguage === 'ENGLISH' ? Language.ENGLISH : Language.CHINESE;
            this.updateTranslations();
            this.emitter.emit(I18nEvent.LANGUAGE_CHANGED);
        });
    }
    
    /**
     * Get the singleton instance
     */
    public static getInstance(): I18nManager {
        if (!I18nManager.instance) {
            I18nManager.instance = new I18nManager();
        }
        return I18nManager.instance;
    }
    
    /**
     * Update translation objects based on current language
     */
    private updateTranslations(): void {
        // Create proxied translation objects with fallback support
        this._UI = this.currentLanguage === Language.ENGLISH 
            ? LANGUAGE_CONFIG.UI[Language.ENGLISH] 
            : createTranslationProxy(LANGUAGE_CONFIG.UI[this.currentLanguage], LANGUAGE_CONFIG.UI[Language.ENGLISH]);

        this._OUTPUT = this.currentLanguage === Language.ENGLISH 
            ? LANGUAGE_CONFIG.OUTPUT[Language.ENGLISH] 
            : createTranslationProxy(LANGUAGE_CONFIG.OUTPUT[this.currentLanguage], LANGUAGE_CONFIG.OUTPUT[Language.ENGLISH]);

        this._PROMPTS = this.currentLanguage === Language.ENGLISH 
            ? LANGUAGE_CONFIG.PROMPTS[Language.ENGLISH] 
            : createTranslationProxy(LANGUAGE_CONFIG.PROMPTS[this.currentLanguage], LANGUAGE_CONFIG.PROMPTS[Language.ENGLISH]);
    }
    
    /**
     * Get the current language
     */
    public getLanguage(): Language {
        return this.currentLanguage;
    }
    
    /**
     * Set the language and update translations
     * @param language The language to set
     */
    public async setLanguage(language: Language): Promise<void> {
        if (language !== this.currentLanguage) {
            const config = AppConfig.getInstance();
            const configLanguage: ConfigLanguage = language === Language.ENGLISH ? 'ENGLISH' : 'CHINESE';
            await config.setLanguage(configLanguage);
            // The language change will be handled by the config change listener
        }
    }
    
    /**
     * Register a listener for language change events
     * @param listener Function to call when language changes
     */
    public onLanguageChanged(listener: () => void): void {
        this.emitter.on(I18nEvent.LANGUAGE_CHANGED, listener);
    }
    
    /**
     * Remove a language change listener
     * @param listener The listener to remove
     */
    public offLanguageChanged(listener: () => void): void {
        this.emitter.off(I18nEvent.LANGUAGE_CHANGED, listener);
    }
    
    // Getters for translation objects
    get UI() { return this._UI; }
    get OUTPUT() { return this._OUTPUT; }
    get PROMPTS() { return this._PROMPTS; }
}

// Initialize the I18nManager singleton
const i18nManager = I18nManager.getInstance();

// Export translation resources and functions
export const UI = i18nManager.UI;
export const OUTPUT = i18nManager.OUTPUT;
export const PROMPTS = i18nManager.PROMPTS;
export const getLanguage = i18nManager.getLanguage.bind(i18nManager);
export const setLanguage = i18nManager.setLanguage.bind(i18nManager);
export const onLanguageChanged = i18nManager.onLanguageChanged.bind(i18nManager);
export const offLanguageChanged = i18nManager.offLanguageChanged.bind(i18nManager);

// Ensure Language is exported properly
export { Language } from './types';
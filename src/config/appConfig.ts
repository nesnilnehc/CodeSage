/**
 * Centralized application configuration management
 */
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { getModelTypeDisplayName, getModelTypeFromDisplayName, ModelType } from '../models/types';

/**
 * Configuration change event types
 */
export enum ConfigChangeEvent {
    LANGUAGE = 'language',
    API_KEY = 'apiKey',
    BASE_URL = 'baseUrl',
    MODEL_TYPE = 'modelType',
    ANY = 'any'
}

/**
 * Main application configuration keys
 */
export enum ConfigKey {
    LANGUAGE = 'language',
    API_KEY = 'apiKey',
    BASE_URL = 'baseUrl',
    MODEL_TYPE = 'modelType'
}

/**
 * Language type
 */
export type Language = 'ENGLISH' | 'CHINESE';

/**
 * Configuration defaults
 */
const CONFIG_DEFAULTS = {
    [ConfigKey.LANGUAGE]: 'ENGLISH',
    [ConfigKey.MODEL_TYPE]: 'deepseek-reasoner',
    [ConfigKey.BASE_URL]: 'https://api.deepseek.com/v1',
    [ConfigKey.API_KEY]: ''
};

/**
 * Application configuration manager
 * Provides centralized access to all application configuration settings
 * with event-based notification for configuration changes
 */
export class AppConfig {
    private static instance: AppConfig;
    private readonly emitter: EventEmitter;
    private readonly extension: string = 'codesage';
    
    private constructor() {
        this.emitter = new EventEmitter();
        
        // Listen for configuration changes from VS Code
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(this.extension)) {
                // Determine which settings changed
                const changedKeys: ConfigChangeEvent[] = [];
                
                for (const key of Object.values(ConfigKey)) {
                    if (e.affectsConfiguration(`${this.extension}.${key}`)) {
                        changedKeys.push(key as unknown as ConfigChangeEvent);
                    }
                }
                
                // Also emit a general change event
                changedKeys.push(ConfigChangeEvent.ANY);
                
                // Emit events for each changed key
                for (const key of changedKeys) {
                    this.emitter.emit(key);
                }
            }
        });
    }
    
    /**
     * Get the singleton instance
     */
    public static getInstance(): AppConfig {
        if (!AppConfig.instance) {
            AppConfig.instance = new AppConfig();
        }
        return AppConfig.instance;
    }
    
    /**
     * Get a configuration value
     * @param key Configuration key
     * @returns The configuration value
     */
    public get<T>(key: ConfigKey): T {
        const config = vscode.workspace.getConfiguration(this.extension);
        return config.get<T>(key) ?? (CONFIG_DEFAULTS[key] as unknown as T);
    }
    
    /**
     * Set a configuration value
     * @param key Configuration key
     * @param value The value to set
     * @param global Whether to set the value globally
     */
    public async set<T>(key: ConfigKey, value: T, global: boolean = true): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.extension);
        await config.update(key, value, global);
        // The event will be emitted by the configuration change listener
    }
    
    /**
     * Listen for configuration changes
     * @param event The configuration change event type to listen for
     * @param listener Callback function to run when the event occurs
     */
    public onChange(event: ConfigChangeEvent, listener: () => void): void {
        this.emitter.on(event, listener);
    }
    
    /**
     * Remove a configuration change listener
     * @param event The configuration change event type
     * @param listener The listener to remove
     */
    public offChange(event: ConfigChangeEvent, listener: () => void): void {
        this.emitter.off(event, listener);
    }

    public getLanguage(): Language {
        const displayName = this.get<string>(ConfigKey.LANGUAGE);
        return displayName as Language;
    }
    
    /**
     * Set the current language
     * @param language The language to set
     */
    public async setLanguage(language: Language): Promise<void> {
        await this.set(ConfigKey.LANGUAGE, language);
    }
    
    /**
     * Get the API key
     */
    public getApiKey(): string {
        return this.get<string>(ConfigKey.API_KEY);
    }
    
    /**
     * Set the API key
     * @param apiKey The API key to set
     */
    public async setApiKey(apiKey: string): Promise<void> {
        await this.set(ConfigKey.API_KEY, apiKey);
    }
    
    /**
     * Get the base URL
     */
    public getBaseURL(): string {
        return this.get<string>(ConfigKey.BASE_URL);
    }
    
    /**
     * Set the base URL
     * @param baseURL The base URL to set
     */
    public async setBaseURL(baseURL: string): Promise<void> {
        await this.set(ConfigKey.BASE_URL, baseURL);
    }
    
    /**
     * Get the model type
     */
    public getModelType(): ModelType {
        const displayName = this.get<string>(ConfigKey.MODEL_TYPE);
        return getModelTypeFromDisplayName(displayName);
    }
    
    /**
     * Set the model type
     * @param modelType The model type to set
     */
    public async setModelType(modelType: ModelType): Promise<void> {
        await this.set(ConfigKey.MODEL_TYPE, getModelTypeDisplayName(modelType));
    }
}

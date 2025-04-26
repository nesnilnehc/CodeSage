import { ChatMessage, ChatCompletionResponse } from './chatTypes';

export interface ChatCompletionOptions {
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    stop?: string[];
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    timeout?: number;
    signal?: AbortSignal;
    compressLargeContent?: boolean;
    compressionThreshold?: number;
}

export abstract class BaseModel {
    abstract createChatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse>;

    protected async compressContentIfNeeded(options: ChatCompletionOptions): Promise<ChatCompletionOptions> {
        if (!options.compressLargeContent || !options.compressionThreshold) {
            return options;
        }

        const compressMessages = async (messages: ChatMessage[]): Promise<ChatMessage[]> => {
            return await Promise.all(messages.map(async (msg) => {
                if (msg.content.length > options.compressionThreshold!) {
                    console.log(`压缩大型消息，原始长度: ${msg.content.length}字符`);
                    
                    const codeBlocks: string[] = [];
                    const codeBlockRegex = /```[\s\S]*?```/g;
                    
                    const withPlaceholders = msg.content.replace(codeBlockRegex, (match) => {
                        codeBlocks.push(match);
                        return `[CODE_BLOCK_${codeBlocks.length - 1}]`;
                    });
                    
                    const compressedText = withPlaceholders
                        .replace(/\n{3,}/g, '\n\n')
                        .replace(/[ \t]+/g, ' ');
                    
                    let finalContent = compressedText;
                    for (let i = 0; i < codeBlocks.length; i++) {
                        finalContent = finalContent.replace(
                            `[CODE_BLOCK_${i}]`,
                            codeBlocks[i]
                        );
                    }
                    
                    console.log(`压缩后长度: ${finalContent.length}字符，减少: ${((msg.content.length - finalContent.length) / msg.content.length * 100).toFixed(1)}%`);
                    
                    return { ...msg, content: finalContent };
                }
                return msg;
            }));
        };

        const compressedMessages = await compressMessages(options.messages);
        return { ...options, messages: compressedMessages };
    }
} 
/**
 * OpenAI API Utility
 *
 * Простая обертка для вызовов OpenAI API
 */

import OpenAI from 'openai';
import { logger } from './logger';

// Инициализация OpenAI клиента
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Chat Completion Parameters
 */
export interface ChatCompletionParams {
  model?: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
}

/**
 * Вызов Chat Completion API
 */
export async function createChatCompletion(params: ChatCompletionParams): Promise<string> {
  const {
    model = 'gpt-4o-mini', // Default: дешевая модель
    messages,
    temperature = 0.7,
    max_tokens = 2000,
  } = params;

  try {
    logger.info(`[OpenAI] Calling ${model}...`);
    const startTime = Date.now();

    const response = await openai.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens,
    });

    const duration = Date.now() - startTime;
    const answer = response.choices[0]?.message?.content || '';
    const usage = response.usage;

    logger.info(`[OpenAI] Completed in ${duration}ms`, {
      model,
      tokens: usage?.total_tokens,
      prompt_tokens: usage?.prompt_tokens,
      completion_tokens: usage?.completion_tokens,
    });

    return answer;
  } catch (error: any) {
    logger.error('[OpenAI] API Error:', error);

    // Более информативная ошибка
    if (error.status === 401) {
      throw new Error('OpenAI API key is invalid or missing');
    } else if (error.status === 429) {
      throw new Error('OpenAI rate limit exceeded');
    } else if (error.status === 500) {
      throw new Error('OpenAI server error');
    } else {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
  }
}

/**
 * Простой вызов: один user query → ответ
 */
export async function simpleQuery(
  query: string,
  options?: { model?: string; systemPrompt?: string }
): Promise<string> {
  const systemPrompt =
    options?.systemPrompt ||
    'You are a helpful AI assistant. Provide clear, concise, and accurate answers.';

  return createChatCompletion({
    model: options?.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query },
    ],
  });
}

/**
 * Тест подключения к OpenAI API
 */
export async function testOpenAIConnection(): Promise<boolean> {
  try {
    logger.info('[OpenAI] Testing connection...');

    const response = await createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
      max_tokens: 10,
    });

    logger.info('[OpenAI] Connection test successful:', response);
    return true;
  } catch (error) {
    logger.error('[OpenAI] Connection test failed:', error);
    return false;
  }
}

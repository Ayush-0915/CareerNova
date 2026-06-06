async function fetchWithRetries(url, init, timeoutMs = 30000, attempts = 3) {
    let lastError = null;
    for (let i = 0; i < attempts; i++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                ...init,
                signal: controller.signal,
            });
            if (response.ok) {
                clearTimeout(timer);
                return response;
            }
            const status = response.status;
            const errText = await response.text();
            // Only retry on transient server/gateway errors (500, 502, 503, 504)
            if ([500, 502, 503, 504].includes(status) && i < attempts - 1) {
                clearTimeout(timer);
                const wait = 500 * Math.pow(2, i);
                await new Promise((r) => setTimeout(r, wait));
                continue;
            }
            const errJson = safeParseJson(errText);
            const errMessage = errJson?.error?.message || errText;
            const errStatus = errJson?.error?.status;
            const errorObj = new Error(errMessage);
            errorObj.status = status;
            errorObj.apiStatus = errStatus;
            clearTimeout(timer);
            throw errorObj;
        }
        catch (err) {
            clearTimeout(timer);
            lastError = err;
            if (err.name === 'AbortError') {
                if (i < attempts - 1) {
                    const wait = 500 * Math.pow(2, i);
                    await new Promise((r) => setTimeout(r, wait));
                    continue;
                }
                throw new Error('Request timed out.');
            }
            // If it's a non-transient API error (e.g. rate limit 429, key error 400), throw immediately
            const status = err.status;
            if (status && ![500, 502, 503, 504].includes(status)) {
                throw err;
            }
            if (i < attempts - 1) {
                const wait = 500 * Math.pow(2, i);
                await new Promise((r) => setTimeout(r, wait));
                continue;
            }
        }
    }
    throw lastError || new Error('Request failed.');
}
export class GeminiProvider {
    constructor(model = 'gemini-2.5-flash') {
        this.name = 'Gemini';
        this.model = model;
    }
    isAvailable() {
        const key = process.env.GEMINI_API_KEY || process.env.GEMINI_API;
        return typeof key === 'string' && key.trim().length > 0;
    }
    async generate(messages, options) {
        const key = process.env.GEMINI_API_KEY || process.env.GEMINI_API;
        if (!key) {
            throw new Error('Gemini API key is not configured.');
        }
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${key}`;
        const timeoutMs = options?.timeoutMs ?? 30000;
        const systemMessage = messages.find((m) => m.role === 'system');
        const conversationMessages = messages.filter((m) => m.role !== 'system');
        const contents = conversationMessages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));
        const body = {
            contents,
            generationConfig: {
                temperature: options?.temperature ?? 0,
                maxOutputTokens: options?.maxTokens ?? 8192,
            },
        };
        if (systemMessage) {
            body.systemInstruction = {
                parts: [{ text: systemMessage.content }],
            };
        }
        if (options?.responseFormat === 'json') {
            body.generationConfig.responseMimeType = 'application/json';
            if (options.responseSchema) {
                body.generationConfig.responseSchema = options.responseSchema;
            }
        }
        try {
            const response = await fetchWithRetries(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            }, timeoutMs, 3);
            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                const finishReason = data?.candidates?.[0]?.finishReason;
                throw new Error(`Gemini returned empty response. Finish reason: ${finishReason || 'unknown'}`);
            }
            return text;
        }
        catch (err) {
            throw err;
        }
    }
}
export class GroqProvider {
    constructor(model = 'llama-3.3-70b-versatile') {
        this.name = 'Groq';
        this.model = model;
    }
    isAvailable() {
        const key = process.env.GROQ_API_KEY;
        return typeof key === 'string' && key.trim().length > 0;
    }
    async generate(messages, options) {
        const key = process.env.GROQ_API_KEY;
        if (!key) {
            throw new Error('Groq API key is not configured.');
        }
        const url = 'https://api.groq.com/openai/v1/chat/completions';
        const timeoutMs = options?.timeoutMs ?? 30000;
        let messagesToSend = messages;
        if (options?.responseSchema) {
            const schemaString = JSON.stringify(options.responseSchema, null, 2);
            const instruction = `\n\nCRITICAL: Your JSON response must conform exactly to this JSON schema:\n${schemaString}\nDo not use other keys. Only use the keys specified in the schema.`;
            messagesToSend = messages.map((m) => {
                if (m.role === 'system') {
                    return { ...m, content: m.content + instruction };
                }
                return m;
            });
            // If no system message was modified, append to the last message
            if (!messagesToSend.some((m) => m.role === 'system' && m.content.includes(instruction)) && messagesToSend.length > 0) {
                const lastIndex = messagesToSend.length - 1;
                messagesToSend[lastIndex] = {
                    ...messagesToSend[lastIndex],
                    content: messagesToSend[lastIndex].content + instruction,
                };
            }
        }
        const body = {
            model: this.model,
            messages: messagesToSend.map((m) => ({
                role: m.role,
                content: m.content,
            })),
            temperature: options?.temperature ?? 0,
        };
        if (options?.maxTokens) {
            body.max_tokens = options.maxTokens;
        }
        else {
            body.max_tokens = 8192; // default to prevent truncation
        }
        if (options?.responseFormat === 'json') {
            body.response_format = { type: 'json_object' };
        }
        try {
            const response = await fetchWithRetries(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            }, timeoutMs, 3);
            const data = await response.json();
            const text = data?.choices?.[0]?.message?.content;
            if (typeof text !== 'string') {
                throw new Error('Groq returned empty response.');
            }
            return text;
        }
        catch (err) {
            throw err;
        }
    }
}
export class LLMService {
    constructor(providers) {
        this.providers = providers;
    }
    async generate(messages, options) {
        let lastError = null;
        // Find active providers in order (Gemini then Groq)
        const activeProviders = this.providers.filter((p) => p.isAvailable());
        if (activeProviders.length === 0) {
            throw new Error('No LLM providers are configured or available. Please check environment variables.');
        }
        for (let i = 0; i < activeProviders.length; i++) {
            const provider = activeProviders[i];
            try {
                console.log(`[LLM] Using ${provider.name}`);
                const result = await provider.generate(messages, options);
                return result;
            }
            catch (err) {
                lastError = err;
                // If current provider is Gemini
                if (provider.name === 'Gemini') {
                    if (this.isRateLimitOrExhaustionError(err)) {
                        const hasGroq = activeProviders.some((p) => p.name === 'Groq');
                        if (hasGroq) {
                            console.warn('[LLM] Gemini quota exceeded, switching to Groq');
                            continue; // Proceed to fallback (Groq)
                        }
                        else {
                            console.error('[LLM] Gemini quota exceeded, but Groq fallback is unavailable (GROQ_API_KEY is missing or empty).');
                        }
                    }
                }
                // If not rate limit error, or if no fallback is available, propagate immediately
                throw err;
            }
        }
        throw new Error(`All LLM providers failed. Last error: ${lastError?.message || 'Unknown'}`);
    }
    isRateLimitOrExhaustionError(error) {
        const status = error.status;
        const apiStatus = error.apiStatus;
        const msg = String(error.message || '').toUpperCase();
        // Trigger on rate-limit related indicators (429, RESOURCE_EXHAUSTED, QUOTA_EXCEEDED, RATE_LIMIT)
        if (status === 429 || apiStatus === 'RESOURCE_EXHAUSTED' || apiStatus === 'QUOTA_EXCEEDED') {
            return true;
        }
        if (msg.includes('429') ||
            msg.includes('RESOURCE_EXHAUSTED') ||
            msg.includes('QUOTA_EXCEEDED') ||
            msg.includes('RATE_LIMIT') ||
            msg.includes('LIMIT EXCEEDED') ||
            msg.includes('TOO MANY REQUESTS') ||
            msg.includes('QUOTA')) {
            return true;
        }
        return false;
    }
}
function safeParseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return null;
    }
}
// Create a singleton instance with default providers
export const llmService = new LLMService([
    new GeminiProvider(),
    new GroqProvider(),
]);

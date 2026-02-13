import { CONFIG } from "../config.js";

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
}

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
}

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

export class OllamaService {
  private static baseUrl: string = CONFIG.ollamaBaseUrl;
  private static timeout: number = 30000; // 30 seconds

  /**
   * Get list of installed Ollama models
   * GET /api/tags
   */
  static async getModels(): Promise<string[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const err: any = new Error(`Ollama API error: ${response.statusText}`);
        err.status = 503;
        throw err;
      }

      const data = await response.json();

      if (!data.models || !Array.isArray(data.models)) {
        const err: any = new Error("Invalid response from Ollama");
        err.status = 503;
        throw err;
      }

      return data.models.map((m: OllamaModel) => m.name);
    } catch (error: any) {
      if (error.name === "AbortError") {
        const err: any = new Error("Ollama connection timeout");
        err.status = 503;
        throw err;
      }

      if (error.code === "ECONNREFUSED" || error.cause?.code === "ECONNREFUSED") {
        const err: any = new Error("Ollama service unavailable. Is Ollama running?");
        err.status = 503;
        throw err;
      }

      // Re-throw with status if already set
      if (error.status) {
        throw error;
      }

      const err: any = new Error(`Failed to fetch models: ${error.message}`);
      err.status = 503;
      throw err;
    }
  }

  /**
   * Generate text using Ollama
   * POST /api/generate
   */
  static async generate(params: OllamaGenerateRequest): Promise<string> {
    if (!params.model || !params.prompt) {
      const err: any = new Error("model and prompt are required");
      err.status = 400;
      throw err;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: params.model,
          prompt: params.prompt,
          stream: false, // Always use non-streaming for now
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          const err: any = new Error(`Model '${params.model}' not found`);
          err.status = 503;
          throw err;
        }

        const err: any = new Error(`Ollama API error: ${response.statusText}`);
        err.status = 503;
        throw err;
      }

      const data: OllamaGenerateResponse = await response.json();

      if (!data.response) {
        const err: any = new Error("Invalid response from Ollama");
        err.status = 503;
        throw err;
      }

      return data.response;
    } catch (error: any) {
      if (error.name === "AbortError") {
        const err: any = new Error("Generation timeout (30s limit exceeded)");
        err.status = 500;
        throw err;
      }

      if (error.code === "ECONNREFUSED" || error.cause?.code === "ECONNREFUSED") {
        const err: any = new Error("Ollama service unavailable. Is Ollama running?");
        err.status = 503;
        throw err;
      }

      // Re-throw with status if already set
      if (error.status) {
        throw error;
      }

      const err: any = new Error(`Generation failed: ${error.message}`);
      err.status = 500;
      throw err;
    }
  }
}

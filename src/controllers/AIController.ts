import { NRPCParams, MethodRegistry } from "../registry.js";
import { BaseController } from "./BaseController.js";
import { Event } from "nostr-tools";
import { OllamaService } from "../services/OllamaService.js";

export class AIController extends BaseController {
  constructor(registry: MethodRegistry) {
    super(registry);

    // Register generatePrompt method
    registry.register("generatePrompt", this.generatePrompt.bind(this), {
      params: [
        { name: "model", type: "string", required: true },
        { name: "prompt", type: "string", required: true },
      ],
      returns: [{ name: "response", type: "string" }],
      errors: [
        { code: 400, message: "model and prompt required" },
        { code: 500, message: "Generation failed" },
        { code: 503, message: "Ollama service unavailable" },
      ],
    });

    // Register getAIModels method
    registry.register("getAIModels", this.getAIModels.bind(this), {
      params: [],
      returns: [{ name: "model", type: "string" }], // Multiple results
      errors: [{ code: 503, message: "Ollama service unavailable" }],
    });

    // Register translateText method (batches language detection + translation)
    registry.register("translateText", this.translateText.bind(this), {
      params: [
        { name: "model", type: "string", required: true },
        { name: "text", type: "string", required: true },
        { name: "targetLang", type: "string", required: true },
      ],
      returns: [
        { name: "detectedLang", type: "string" },
        { name: "needsTranslation", type: "string" },
        { name: "translation", type: "string" },
      ],
      errors: [
        { code: 400, message: "model, text, and targetLang required" },
        { code: 500, message: "Translation failed" },
        { code: 503, message: "Ollama service unavailable" },
      ],
    });

    // Register batchDetectLanguages method (batches multiple language detections)
    registry.register("batchDetectLanguages", this.batchDetectLanguages.bind(this), {
      params: [
        { name: "model", type: "string", required: true },
        { name: "texts", type: "string", required: true }, // JSON array of texts
      ],
      returns: [
        { name: "result_json", type: "string" }, // JSON array of language codes
      ],
      errors: [
        { code: 400, message: "model and texts required" },
        { code: 500, message: "Detection failed" },
        { code: 503, message: "Ollama service unavailable" },
      ],
    });
  }

  async generatePrompt(params: NRPCParams, event: Event) {
    if (!params.model || !params.prompt) {
      const err: any = new Error("model and prompt required");
      err.status = 400;
      throw err;
    }

    try {
      const response = await OllamaService.generate({
        model: params.model,
        prompt: params.prompt,
      });

      return { response };
    } catch (error: any) {
      // OllamaService already sets proper status codes
      throw error;
    }
  }

  async getAIModels(params: NRPCParams, event: Event) {
    try {
      const models = await OllamaService.getModels();

      // Return array of models as multiple result tags
      // The nRPC framework will convert this to multiple ["result", "model", "name"] tags
      return models.map((name) => ({ model: name }));
    } catch (error: any) {
      // OllamaService already sets proper status codes
      throw error;
    }
  }

  async translateText(params: NRPCParams, event: Event) {
    if (!params.model || !params.text || !params.targetLang) {
      const err: any = new Error("model, text, and targetLang required");
      err.status = 400;
      throw err;
    }

    try {
      // Step 1: Detect language
      const detectPrompt = `Determine the language of the following text. Only respond with the ISO 639-1 language code (e.g., "en", "es", "fr").
Ignore:
- URLs (http links)
- Hashes
- Random alphanumeric strings or identifiers

Default to "en" unless you're very confident it's another language.
Text:\n\n${params.text}`;

      const detectedLang = await OllamaService.generate({
        model: params.model,
        prompt: detectPrompt,
      });

      const langCode = detectedLang.trim().toLowerCase();
      const needsTranslation = langCode !== params.targetLang.toLowerCase();

      // Step 2: Translate if needed
      let translation = params.text; // Default to original text
      if (needsTranslation && /^[a-z]{2}$/.test(langCode)) {
        const translatePrompt = `Translate the following text to ${params.targetLang}. You may skip or preserve hashes, URLs, and nostr identifiers:\n\n${params.text}`;

        translation = await OllamaService.generate({
          model: params.model,
          prompt: translatePrompt,
        });
      }

      return {
        detectedLang: langCode,
        needsTranslation: needsTranslation.toString(),
        translation: translation.trim(),
      };
    } catch (error: any) {
      // OllamaService already sets proper status codes
      throw error;
    }
  }

  async batchDetectLanguages(params: NRPCParams, event: Event) {
    if (!params.model || !params.texts) {
      const err: any = new Error("model and texts required");
      err.status = 400;
      throw err;
    }

    try {
      // Parse texts array from JSON
      let texts: string[];
      try {
        texts = JSON.parse(params.texts);
        if (!Array.isArray(texts)) {
          throw new Error("texts must be an array");
        }
      } catch (error) {
        const err: any = new Error("Invalid texts parameter: must be JSON array");
        err.status = 400;
        throw err;
      }

      // Build a single prompt with all texts
      const prompt = `Determine the language of each of the following texts. Respond with ONLY a JSON array of ISO 639-1 language codes (e.g., ["en", "es", "fr"]).
Rules:
- Ignore URLs, hashes, and random alphanumeric strings
- Default to "en" unless very confident
- Return exactly ${texts.length} language codes in the same order

Texts:
${texts.map((text, i) => `${i + 1}. ${text.slice(0, 200)}`).join("\n\n")}

Response (JSON array only):`;

      const response = await OllamaService.generate({
        model: params.model,
        prompt,
      });

      // Parse the response as JSON array
      let languages: string[];
      try {
        // Extract JSON array from response (might have extra text)
        const jsonMatch = response.match(/\[.*\]/s);
        if (jsonMatch) {
          languages = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON array found in response");
        }

        // Validate we got the right number of results
        if (languages.length !== texts.length) {
          while (languages.length < texts.length) {
            languages.push("en");
          }
        }
      } catch (error) {
        // Return "en" for all texts as fallback
        languages = texts.map(() => "en");
      }

      // Return as result_json
      return { result_json: JSON.stringify(languages) };
    } catch (error: any) {
      throw error;
    }
  }
}

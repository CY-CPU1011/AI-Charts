import OpenAI from "openai";

let openai: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is required to call DeepSeek.");
  }

  openai ??= new OpenAI({
    apiKey,
    baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
  });

  return openai;
}

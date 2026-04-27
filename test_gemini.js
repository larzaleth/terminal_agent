import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-3.1-pro-preview",
      contents: [{ role: "user", parts: [{ text: "What is 2+2? Use a tool to find out if possible, otherwise just answer." }] }],
      config: {
        thinkingConfig: { includeThoughts: true },
        tools: [{
          functionDeclarations: [{
            name: "calculator",
            description: "A calculator",
            parameters: { type: "OBJECT", properties: { query: { type: "STRING" } } }
          }]
        }]
      }
    });

    for await (const chunk of stream) {
      const parts = chunk.candidates?.[0]?.content?.parts || [];
      console.log("PARTS:", JSON.stringify(parts, null, 2));
    }
  } catch (err) {
    console.error(err);
  }
}

run();

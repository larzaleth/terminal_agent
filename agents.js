import { ai } from "./llm.js";
import { tools, toolDeclarations } from "./tools.js";
import { loadMemory, addMemory, saveMemory } from "./memory.js";

import { config } from "./config.js";

const model = config.model;
const systemInstruction = config.systemInstruction;

export async function runAgent(userInput) {
  // Load previous memory (format: { role, parts })
  let memory = loadMemory();

  // Add the user input
  memory.push({ role: "user", parts: [{ text: userInput }] });

  let isDone = false;
  let finalResponse = "";

  while (!isDone) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: memory,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: toolDeclarations }],
        },
      });

      const messageContent = response.candidates?.[0]?.content;
      if (!messageContent) {
        finalResponse += "\n(No response from model)";
        break;
      }

      const parts = messageContent.parts || [];
      // Model responded, save it to memory
      memory.push({ role: "model", parts });

      let toolCallsPromises = [];

      for (const part of parts) {
        if (part.text) {
          finalResponse += part.text + "\n";
          console.log(`\n🤖 > ${part.text}`); // print text as it happens
        }
        
        if (part.functionCall) {
          const { name, args } = part.functionCall;
          const handler = tools[name];
          if (handler) {
            toolCallsPromises.push((async () => {
              const result = await handler(args);
              return {
                functionResponse: {
                  name,
                  response: { result },
                },
              };
            })());
          }
        }
      }

      if (toolCallsPromises.length > 0) {
        // Model called tools, let's process them and loop again
        const toolResponsesParts = await Promise.all(toolCallsPromises);
        
        // Push tool results back to memory as user role
        memory.push({ role: "user", parts: toolResponsesParts });
        // Loop continues so model can respond to tool outputs
      } else {
        // No more tool calls, we are completely done
        isDone = true;
      }
    } catch (err) {
      console.error("\n❌ Agent Error:", err.message);
      isDone = true;
      finalResponse += "\n[Error executing step: " + err.message + "]";
    }
  }

  // Save the full memory context
  saveMemory(memory);
  
  return finalResponse;
}

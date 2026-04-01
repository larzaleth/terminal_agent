import dotenv from "dotenv";
import path from "path";
import os from "os";
import { GoogleGenAI } from "@google/genai";

// Load from global ~/.myagent.env
const globalEnvPath = path.join(os.homedir(), ".myagent.env");
dotenv.config({ path: globalEnvPath });

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

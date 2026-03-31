import dotenv from "dotenv";
import path from "path";
import os from "os";

// Fallback load configuration from user's global ~/.myagent.env
const globalEnvPath = path.join(os.homedir(), ".myagent.env");
dotenv.config({ path: globalEnvPath });

import { GoogleGenAI } from "@google/genai";

export const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

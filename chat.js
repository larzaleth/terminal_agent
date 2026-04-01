import fs from "fs";

const CHAT_FILE = "chat.log";

export function saveChat(message) {
    fs.appendFileSync(CHAT_FILE, JSON.stringify(message) + "\n");
}
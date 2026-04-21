import { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import { h } from "../h.js";

export function InputBox({ disabled, onSubmit }) {
  const [value, setValue] = useState("");

  const handleSubmit = (v) => {
    const trimmed = v.trim();
    if (!trimmed) return;
    setValue("");
    onSubmit(trimmed);
  };

  return h(
    Box,
    { paddingX: 1, borderStyle: "round", borderColor: disabled ? "gray" : "green" },
    h(Text, { color: disabled ? "gray" : "green", bold: true }, "🧑 > "),
    disabled
      ? h(Text, { color: "gray", italic: true }, value || "Agent is working…")
      : h(TextInput, { value, onChange: setValue, onSubmit: handleSubmit, showCursor: true })
  );
}

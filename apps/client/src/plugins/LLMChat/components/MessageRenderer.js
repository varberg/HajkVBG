import React from "react";
import UserMessage from "./UserMessage";
import AssistantMessage from "./AssistantMessage";

function MessageRenderer({ message, chatModel }) {
  if (message.role === "user") {
    return <UserMessage message={message} />;
  }

  if (message.role === "assistant") {
    return <AssistantMessage message={message} chatModel={chatModel} />;
  }

  return null;
}

export default MessageRenderer;

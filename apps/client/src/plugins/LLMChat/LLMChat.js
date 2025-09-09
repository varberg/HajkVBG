import React from "react";
import BaseWindowPlugin from "../BaseWindowPlugin";
import ChatIcon from "@mui/icons-material/Chat";
import LLMChatView from "./LLMChatView";

function LLMChat(props) {
  console.log("LLMChat constructor", props.options);

  return (
    <BaseWindowPlugin
      {...props}
      type="LLMChat"
      custom={{
        icon: <ChatIcon />,
        title: "LLM-chatt",
        description: "",
        height: "dynamic",
        width: 400,
      }}
    >
      <LLMChatView {...props} />
    </BaseWindowPlugin>
  );
}

export default LLMChat;

import React from "react";
import BaseWindowPlugin from "../BaseWindowPlugin";

import AiChatModel from "./AiChatModel";
import AiChatView from "./AiChatView";

import ChatIcon from "@mui/icons-material/Chat";

import {
  DEFAULT_DESCRIPTION,
  DEFAULT_INTRO_TEXT,
  DEFAULT_TITLE,
} from "./constants";
import type { AiChatProps } from "./types";

/**
 * @summary Lets users find layers by asking, and turn them on and off from the
 * answers. Runs on Backend's chat, see AI_* in Backend's .env.
 */
const AiChat: React.FC<AiChatProps> = (props) => {
  const [model] = React.useState(
    () => new AiChatModel(props.app, props.map, props.options)
  );
  const { app, options } = props;

  return (
    <BaseWindowPlugin
      {...props}
      type="aichat"
      custom={{
        icon: <ChatIcon />,
        title: options.title || DEFAULT_TITLE,
        description: options.description || DEFAULT_DESCRIPTION,
        height: 600,
        width: 400,
        // Plugins are on the left by default, and a plugin that opens closes
        // the windows on its own side, which would hide the answer.
        position: "right",
        // The messages scroll on their own, so that the input stays in place
        scrollable: false,
        disablePadding: true,
      }}
    >
      <AiChatView
        model={model}
        layerControl={app.layerControl}
        introText={options.introText || DEFAULT_INTRO_TEXT}
      />
    </BaseWindowPlugin>
  );
};

export default AiChat;

import React, { useMemo } from "react";
import { Box, Paper } from "@mui/material";
import ChatWindow from "./components/ChatWindow";
import LLMChatModel from "./models/LLMChatModel";

function LLMChatView(props) {
  const { map, app, options } = props;

  const model = useMemo(
    () =>
      new LLMChatModel({
        map,
        app,
        globalObserver: app?.globalObserver,
        pluginOptions: options,
      }),
    [map, app, options]
  );

  return (
    <Box sx={{ p: 0, height: "100%" }}>
      <Paper
        elevation={0}
        sx={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "background.paper",
        }}
      >
        <Box sx={{ flexGrow: 1, minHeight: 0 }}>
          <ChatWindow model={model} />
        </Box>
      </Paper>
    </Box>
  );
}

export default LLMChatView;

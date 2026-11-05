import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent, KeyboardEvent } from "react";

import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SendIcon from "@mui/icons-material/Send";
import StopIcon from "@mui/icons-material/Stop";

import { useWindowSheetScroll } from "../../components/WindowSheet";
import { isMobile } from "../../utils/IsMobile";

import ChatMessageItem from "./ChatMessageItem";
import { MAX_MESSAGE_LENGTH, TOOL_STATUS, UI_STRINGS } from "./constants";
import type { AiChatViewProps } from "./types";

// How close to the end counts as following along, in pixels
const FOLLOW_MARGIN = 40;

function AiChatView({ model, layerControl, introText }: AiChatViewProps) {
  const { messages, running, activeTool } = useSyncExternalStore(
    model.subscribe,
    model.getState
  );
  const [draft, setDraft] = useState("");
  const { scrollToTop } = useWindowSheetScroll();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Scrolling up to read must not be undone by the next piece of the answer
  const followRef = useRef(true);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list && followRef.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, activeTool]);

  const handleScroll = () => {
    const list = listRef.current;
    if (list) {
      const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
      followRef.current = distance < FOLLOW_MARGIN;
    }
  };

  const send = () => {
    if (running || draft.trim() === "") {
      return;
    }
    followRef.current = true;
    model.send(draft);
    setDraft("");

    // A phone's sheet holds a focused input at its top, above the keyboard, which
    // leaves the messages out of view. So close the keyboard to show the answer.
    if (isMobile) {
      inputRef.current?.blur();
      scrollToTop();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // While composing, Enter belongs to the input method
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  // A sheet follows its content and opens low, so with nothing to scroll the
  // input stays near the top. Later the chat fills the 70% snap, less the header.
  const mobileHeight = messages.length === 0 ? "auto" : "calc(70dvh - 56px)";

  return (
    <Stack sx={{ height: isMobile ? mobileHeight : "100%", minHeight: 0 }}>
      <Stack
        ref={listRef}
        role="log"
        aria-live="polite"
        spacing={1.5}
        onScroll={handleScroll}
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          p: 1.5,
          userSelect: "text",
        }}
      >
        {messages.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {introText}
          </Typography>
        )}
        {messages.map((message) => (
          <ChatMessageItem
            key={message.id}
            message={message}
            layerControl={layerControl}
          />
        ))}
      </Stack>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 32,
          px: 1.5,
        }}
      >
        <Box
          role="status"
          sx={{ display: "flex", alignItems: "center", gap: 1 }}
        >
          {running && (
            <>
              <CircularProgress size={14} />
              <Typography variant="caption" color="text.secondary">
                {(activeTool && TOOL_STATUS[activeTool]) || UI_STRINGS.thinking}
              </Typography>
            </>
          )}
        </Box>
        {messages.length > 0 && (
          <Button
            size="small"
            startIcon={<RestartAltIcon />}
            onClick={model.reset}
          >
            {UI_STRINGS.newConversation}
          </Button>
        )}
      </Box>

      <Box
        component="form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          send();
        }}
        noValidate
        sx={{
          display: "flex",
          alignItems: "flex-end",
          gap: 1,
          p: 1.5,
          pt: 0.5,
        }}
      >
        <TextField
          fullWidth
          multiline
          maxRows={5}
          size="small"
          inputRef={inputRef}
          label={UI_STRINGS.inputLabel}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          slotProps={{ htmlInput: { maxLength: MAX_MESSAGE_LENGTH } }}
        />
        {running ? (
          <Tooltip title={UI_STRINGS.stop}>
            <IconButton aria-label={UI_STRINGS.stop} onClick={model.stop}>
              <StopIcon />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title={UI_STRINGS.send}>
            {/* A disabled button can't hold a tooltip, hence the span */}
            <span>
              <IconButton
                type="submit"
                color="primary"
                aria-label={UI_STRINGS.send}
                disabled={draft.trim() === ""}
              >
                <SendIcon />
              </IconButton>
            </span>
          </Tooltip>
        )}
      </Box>
    </Stack>
  );
}

export default AiChatView;

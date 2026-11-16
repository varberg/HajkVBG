import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
import DrawnToggle from "./DrawnToggle";
import IntroPanel from "./IntroPanel";
import PrivacyPolicyLink from "./PrivacyPolicyLink";
import SuggestionList from "./SuggestionList";
import { useDrawnCount } from "./drawnFeatures";
import { MAX_MESSAGE_LENGTH, TOOL_STATUS, UI_STRINGS } from "./constants";
import type { AiChatViewProps } from "./types";

// How close to the end counts as following along, in pixels
const FOLLOW_MARGIN = 40;

function AiChatView({
  model,
  layerControl,
  introText,
  privacyPolicyUrl,
}: AiChatViewProps) {
  const { messages, running, activeTool, includeDrawn } = useSyncExternalStore(
    model.subscribe,
    model.getState
  );
  const drawnCount = useDrawnCount(model.drawings);
  const [draft, setDraft] = useState("");
  const warningId = useId();
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
    // `running` too, as the follow-up questions show once the answer is done
  }, [messages, activeTool, running]);

  const handleScroll = () => {
    const list = listRef.current;
    if (list) {
      const distance = list.scrollHeight - list.scrollTop - list.clientHeight;
      followRef.current = distance < FOLLOW_MARGIN;
    }
  };

  const send = (text = draft) => {
    if (running || text.trim() === "") {
      return;
    }
    followRef.current = true;
    model.send(text);
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

  // Only the latest answer has them, as older ones no longer fit the map
  const lastMessage = messages.at(-1);
  const suggestions =
    !running &&
    lastMessage?.role === "assistant" &&
    lastMessage.error === null &&
    !lastMessage.stopped
      ? lastMessage.suggestions
      : [];

  const hasDrawn = drawnCount > 0;
  const status = (
    <Box
      role="status"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        // Only takes room above the toggle while there is something to show
        ...(hasDrawn && running && { minHeight: 24, px: 1.5 }),
      }}
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
  );

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
          <IntroPanel
            introText={introText}
            privacyPolicyUrl={privacyPolicyUrl}
            disabled={running}
            onExample={send}
          />
        )}
        {messages.map((message) => (
          <ChatMessageItem
            key={message.id}
            message={message}
            layerControl={layerControl}
            routeLayer={model.routeLayer}
            onGoToPlace={model.goToPlace}
            onDownload={model.download}
          />
        ))}
        {suggestions.length > 0 && (
          <SuggestionList
            items={suggestions}
            label={UI_STRINGS.suggestions}
            disabled={running}
            small
            onPick={send}
          />
        )}
      </Stack>

      {/* With drawings the status sits above the toggle, else beside the button */}
      {hasDrawn && status}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          minHeight: 32,
          px: 1.5,
        }}
      >
        {hasDrawn ? (
          <DrawnToggle
            model={model}
            checked={includeDrawn}
            count={drawnCount}
          />
        ) : (
          status
        )}
        {messages.length > 0 && (
          <Button
            size="small"
            startIcon={<RestartAltIcon />}
            onClick={model.reset}
            sx={{ flexShrink: 0 }}
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
          px: 1.5,
          pt: 0.5,
          pb: 0.5,
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
          slotProps={{
            htmlInput: {
              maxLength: MAX_MESSAGE_LENGTH,
              "aria-describedby": warningId,
            },
          }}
        />
        {running ? (
          <Tooltip title={UI_STRINGS.stop}>
            <IconButton
              color="primary"
              aria-label={UI_STRINGS.stop}
              onClick={model.stop}
            >
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
      <Typography
        id={warningId}
        variant="caption"
        color="error"
        sx={{ px: 1.5, pb: 1 }}
      >
        {UI_STRINGS.sensitiveWarning}
        <PrivacyPolicyLink url={privacyPolicyUrl} newLine>
          {UI_STRINGS.privacyPolicyShort}
        </PrivacyPolicyLink>
      </Typography>
    </Stack>
  );
}

export default AiChatView;

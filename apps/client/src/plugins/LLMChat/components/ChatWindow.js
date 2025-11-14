import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Box,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import SendIcon from "@mui/icons-material/Send";
import ClearIcon from "@mui/icons-material/Clear";
import HajkToolTip from "../../../components/HajkToolTip";
import MessageRenderer from "./MessageRenderer";
import TypingAnim from "./TypingAnim";

function ChatWindow(props) {
  const { model } = props;

  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollContainerRef = useRef(null);

  const addUserMessage = useCallback((text) => {
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-u`, role: "user", text },
    ]);
  }, []);

  const addAssistantMessage = useCallback((text) => {
    setMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-a`, role: "assistant", text },
    ]);
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Small delay to ensure DOM is updated
    setTimeout(() => {
      // If the last message is from assistant, scroll to show the question at the top
      if (
        messages.length > 0 &&
        messages[messages.length - 1].role === "assistant"
      ) {
        // Find the last user message (the question)
        const lastUserMessageIndex = messages.findLastIndex(
          (m) => m.role === "user"
        );
        if (lastUserMessageIndex >= 0) {
          // Get the message container (Stack component)
          const messageContainer = container.children[0];
          if (
            messageContainer &&
            messageContainer.children[lastUserMessageIndex]
          ) {
            const userMessageElement =
              messageContainer.children[lastUserMessageIndex];

            // Get the position relative to the scrollable container
            const containerRect = container.getBoundingClientRect();
            const elementRect = userMessageElement.getBoundingClientRect();
            const scrollTop =
              container.scrollTop + (elementRect.top - containerRect.top) - 3;

            container.scrollTo({
              top: scrollTop,
              behavior: "smooth",
            });
          }
        }
      } else {
        // For user messages, scroll to bottom as usual
        container.scrollTop = container.scrollHeight;
      }
    }, 100);
  }, [messages]);

  // Initialize conversation and hook into model callbacks
  useEffect(() => {
    if (!model) return;

    let isMounted = true;

    // Wire callbacks
    const originalOnMessageReceived = model.onMessageReceived;
    const originalOnStatusChange = model.onStatusChange;

    model.onMessageReceived = (message) => {
      if (!isMounted) return;
      if (message.role === "assistant") {
        const content = Array.isArray(message.content)
          ? message.content.find((c) => typeof c.text === "string")?.text
          : message.content?.text || "";
        if (content) addAssistantMessage(content);
      }
    };

    model.onStatusChange = () => {
      // could surface status in UI later
    };

    // Ensure a conversation exists
    if (!model.isConversationInitialized?.()) {
      model.createConversation?.().catch(() => {
        // ignore for now, handled on send
      });
    }

    return () => {
      isMounted = false;
      model.onMessageReceived = originalOnMessageReceived;
      model.onStatusChange = originalOnStatusChange;
    };
  }, [model, addAssistantMessage]);

  const handleSend = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;
    addUserMessage(trimmed);
    setInputValue("");
    setIsLoading(true);

    if (!model) {
      setIsLoading(false);
      return;
    }

    try {
      if (
        !model.isConversationInitialized?.() ||
        !model.getCurrentConversationId?.()
      ) {
        await model.createConversation?.();
      }
      await model.sendMessage(trimmed);
    } catch (e) {
      addAssistantMessage("Tyvärr, något gick fel.");
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, model, addUserMessage, addAssistantMessage, isLoading]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const RenderedMessages = useMemo(
    () => (
      <Stack spacing={1.5} sx={{ p: 1.5 }}>
        {messages.length === 0 && (
          <Box sx={{ display: "flex", justifyContent: "flex-start", p: 0 }}>
            <Typography sx={{ fontSize: "0.75rem", mt: 0, pt: 0 }}>
              <p style={{ margin: 0 }}>
                Detta AI-baserade verktyg är ett <strong>pilottest</strong> för
                att underlätta sökning efter relevanta kartlager.
              </p>

              <p>
                Lagerchatten använder sig av lagerinformation och metadata från
                KommunGIS som analyseras med hjälp av OpenAI för att identifiera
                möjliga kartlager. Jämte chattdialog och lager-förslag
                tillhandahålls direktlänkar till föreslagna lager.
              </p>

              <p>
                Obs! <strong>Uppge aldrig känslig information</strong> i
                lagerchatten! Exempel på sådan information är t.ex.
                personuppgifter eller annan GDPR-känslig data.
              </p>
            </Typography>
          </Box>
        )}
        {messages.map((m) => (
          <MessageRenderer key={m.id} message={m} chatModel={model} />
        ))}
        {isLoading && (
          <Box
            sx={{ display: "flex", justifyContent: "flex-start", p: 1, pl: 0 }}
          >
            <TypingAnim />
          </Box>
        )}
      </Stack>
    ),
    [messages, model, isLoading]
  );

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 0 }}>
        <HajkToolTip title="Ny chat">
          <IconButton
            onClick={() => {
              clearMessages();
              setInputValue("");
              setIsLoading(false);
              model?.reset?.();
              model?.createConversation?.().catch(() => {});
            }}
            size="small"
            color="primary"
            aria-label="Starta ny chat"
          >
            <AddIcon />
          </IconButton>
        </HajkToolTip>
      </Box>
      <Box
        ref={scrollContainerRef}
        sx={{
          flexGrow: 1,
          overflowY: "auto",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          backgroundColor: "background.default",
        }}
      >
        {RenderedMessages}
      </Box>

      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
        <TextField
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Vad letar du efter?"
          fullWidth
          size="small"
          sx={{
            "& .MuiInputBase-input": {
              fontSize: "0.75rem",
            },
          }}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label="rensa inmatning"
                    onClick={() => setInputValue("")}
                    size="small"
                    sx={{ p: 0.25 }}
                  >
                    <ClearIcon sx={{ fontSize: "0.9rem" }} />
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />
        <IconButton
          color="primary"
          onClick={handleSend}
          aria-label="skicka"
          disabled={isLoading || !inputValue.trim()}
        >
          <SendIcon />
        </IconButton>
      </Stack>
    </Box>
  );
}

export default ChatWindow;

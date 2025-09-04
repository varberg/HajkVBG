import React, { useState } from "react";
import {
  Box,
  Paper,
  Typography,
  List,
  ListItem,
  Button,
  Collapse,
  IconButton,
} from "@mui/material";
import {
  ExpandMore,
  ExpandLess,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import HajkToolTip from "../../../components/HajkToolTip";

function AssistantMessage({ message, chatModel }) {
  const [expandedItems, setExpandedItems] = useState({});
  const [layerVisibility, setLayerVisibility] = useState({});

  const toggleExpanded = (index) => {
    setExpandedItems((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleItemAction = async (item) => {
    // Toggle the visibility state
    const isCurrentlyVisible = layerVisibility[item.id] || false;
    const newVisibility = !isCurrentlyVisible;

    // Update local state
    setLayerVisibility((prev) => ({
      ...prev,
      [item.id]: newVisibility,
    }));

    // Add visibility property to the item
    const itemWithVisibility = {
      ...item,
      visible: newVisibility,
    };

    // Call the appropriate method based on visibility
    if (newVisibility) {
      chatModel.handleShowLayer(itemWithVisibility);
    } else {
      chatModel.handleHideLayer(itemWithVisibility);
    }
  };

  // Always create a messageData object with answer and list properties
  let messageData = { answer: "", list: [] };

  try {
    if (typeof message.text === "string") {
      let textToParse = message.text;

      // Handle markdown-formatted JSON (```json ... ```)
      // For some reason, the json is sometimes wrapped in markdown. Depends on model etc.
      if (textToParse.includes("```json")) {
        const jsonMatch = textToParse.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          textToParse = jsonMatch[1].trim();
        }
      }

      // Try to parse as JSON first
      const parsed = JSON.parse(textToParse);
      if (parsed && typeof parsed === "object") {
        messageData = {
          answer: parsed.answer || message.text,
          list: parsed.list || [],
        };
      } else {
        // If parsing fails or result isn't an object, treat as plain text
        messageData = { answer: message.text, list: [] };
      }
    } else if (typeof message.text === "object") {
      // Already an object, extract answer and list
      messageData = {
        answer: message.text.answer || JSON.stringify(message.text),
        list: message.text.list || [],
      };
    } else {
      // Fallback for other types
      messageData = { answer: String(message.text), list: [] };
    }
  } catch (e) {
    // If JSON parsing fails, treat as plain text
    messageData = { answer: message.text, list: [] };
  }

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "flex-start",
      }}
    >
      <Paper
        elevation={0}
        sx={{
          maxWidth: "100%",
          p: 0,
          backgroundColor: "transparent",
          borderColor: "transparent",
          border: "none",
          borderRadius: 0,
          boxShadow: "none",
        }}
      >
        {/* Render the answer */}
        {messageData.answer && (
          <Typography
            sx={{
              whiteSpace: "pre-wrap",
              fontSize: "0.75rem",
              mb: messageData.list && messageData.list.length > 0 ? 2 : 0,
            }}
          >
            {messageData.answer}
          </Typography>
        )}

        {/* Render the list items */}
        {messageData.list && messageData.list.length > 0 && (
          <List dense sx={{ p: 0, m: 0 }}>
            {messageData.list
              .filter((item) => typeof item === "object" && item !== null)
              .map((item, index) => (
                <ListItem
                  key={index}
                  sx={{
                    p: 1,
                    pl: 1,
                    flexDirection: "column",
                    alignItems: "flex-start",
                    backgroundColor: (theme) =>
                      index % 2 === 0
                        ? theme.palette.mode === "dark"
                          ? "rgba(255,255,255,0.02)"
                          : "rgba(0,0,0,0.01)"
                        : theme.palette.mode === "dark"
                          ? "rgba(255,255,255,0.05)"
                          : "rgba(0,0,0,0.03)",
                    borderRadius: 1,
                    mb: 0.5,
                  }}
                >
                  {/* Title and ID row */}
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      width: "100%",
                      mb: 0,
                    }}
                  >
                    <Typography
                      sx={{ fontSize: "0.75rem", fontWeight: "medium" }}
                    >
                      {item.title || "Untitled"}
                    </Typography>
                    {item.id && (
                      <HajkToolTip
                        title={
                          layerVisibility[item.id] ? "Göm lager" : "Visa lager"
                        }
                        placement="top"
                        arrow
                      >
                        <IconButton
                          size="small"
                          onClick={() => handleItemAction(item)}
                          sx={{
                            p: 0.5,
                            marginTop: "-6px",
                            color: "primary.main",
                            "&:hover": {
                              backgroundColor: "primary.main",
                              color: "primary.contrastText",
                            },
                          }}
                        >
                          {layerVisibility[item.id] ? (
                            <VisibilityOff sx={{ fontSize: "1rem" }} />
                          ) : (
                            <Visibility sx={{ fontSize: "1rem" }} />
                          )}
                        </IconButton>
                      </HajkToolTip>
                    )}
                  </Box>

                  {/* Läs mer button - only show if item.text exists */}
                  {item.text && (
                    <Button
                      size="small"
                      onClick={() => toggleExpanded(index)}
                      sx={{
                        p: 0,
                        minWidth: "auto",
                        textTransform: "none",
                        fontSize: "0.7rem",
                        color: "primary.main",
                      }}
                    >
                      Läs mer
                      {expandedItems[index] ? (
                        <ExpandLess sx={{ ml: 0.5, fontSize: "0.7rem" }} />
                      ) : (
                        <ExpandMore sx={{ ml: 0.5, fontSize: "0.7rem" }} />
                      )}
                    </Button>
                  )}

                  {/* Collapsible content */}
                  <Collapse
                    in={expandedItems[index]}
                    timeout="auto"
                    unmountOnExit
                    sx={{
                      width: "100%",
                    }}
                  >
                    <Box
                      sx={{
                        mt: 0,
                        p: 1,
                        backgroundColor: (theme) =>
                          theme.palette.mode === "dark"
                            ? "rgba(255,255,255,0.03)"
                            : "rgba(0,0,0,0.02)",
                        borderRadius: 1,
                        width: "100%",
                      }}
                    >
                      <Typography
                        sx={{ fontSize: "0.7rem", whiteSpace: "pre-wrap" }}
                      >
                        {item.text}
                      </Typography>
                    </Box>
                  </Collapse>
                </ListItem>
              ))}
          </List>
        )}
      </Paper>
    </Box>
  );
}

export default AssistantMessage;

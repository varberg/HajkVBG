import { memo } from "react";
import type { ReactNode } from "react";

import { Alert, Box, Link, Stack, Typography } from "@mui/material";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { customComponentsForReactMarkdown } from "../../utils/customComponentsForReactMarkdown";

import { UI_STRINGS } from "./constants";
import LayerResultList from "./LayerResultList";
import type { ChatMessageItemProps } from "./types";

// An answer can repeat text from layer metadata, which anyone with access to the
// config can write. So it can't load images or link to anything but web pages.
const DISALLOWED_ELEMENTS = ["img"];
const onlyWebLinks = (url: string) => (/^https?:\/\//i.test(url) ? url : null);

const markdownComponents = {
  ...customComponentsForReactMarkdown,
  a: ({ href, children }: { href?: string; children?: ReactNode }) =>
    href ? (
      <Link href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </Link>
    ) : (
      children
    ),
} as Components;

function ChatMessageItem({ message, layerControl }: ChatMessageItemProps) {
  if (message.role === "user") {
    return (
      <Box
        sx={{
          alignSelf: "flex-end",
          maxWidth: "85%",
          px: 1.5,
          py: 1,
          borderRadius: 2,
          bgcolor: "action.selected",
        }}
      >
        <Typography
          variant="body2"
          sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
        >
          {message.text}
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={1} sx={{ overflowWrap: "anywhere" }}>
      {message.notices.map((notice) => (
        <Alert key={notice} severity="info">
          {notice}
        </Alert>
      ))}
      {message.text !== "" && (
        <Box>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
            disallowedElements={DISALLOWED_ELEMENTS}
            urlTransform={onlyWebLinks}
            skipHtml
          >
            {message.text}
          </ReactMarkdown>
        </Box>
      )}
      {message.layers.length > 0 && (
        <LayerResultList items={message.layers} layerControl={layerControl} />
      )}
      {message.stopped && (
        <Typography variant="caption" color="text.secondary">
          {UI_STRINGS.stopped}
        </Typography>
      )}
      {message.error !== null && (
        <Alert severity="error">{message.error}</Alert>
      )}
    </Stack>
  );
}

// Finished messages keep their identity, so only the running answer re-renders
export default memo(ChatMessageItem);

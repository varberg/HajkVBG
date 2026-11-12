import { memo } from "react";
import type { ReactNode } from "react";

import { Alert, Box, Link, Stack, Typography } from "@mui/material";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { customComponentsForReactMarkdown } from "../../utils/customComponentsForReactMarkdown";

import { UI_STRINGS } from "./constants";
import DownloadMenu from "./DownloadMenu";
import LayerResultList from "./LayerResultList";
import RouteCard from "./RouteCard";
import { routeColor } from "./routeLayer";
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

function ChatMessageItem({
  message,
  layerControl,
  routeLayer,
  onGoToPlace,
  onDownload,
}: ChatMessageItemProps) {
  if (message.role === "user") {
    return (
      <Stack
        sx={{ alignSelf: "flex-end", alignItems: "flex-end", maxWidth: "85%" }}
      >
        <Box
          sx={{ px: 1.5, py: 1, borderRadius: 2, bgcolor: "action.selected" }}
        >
          <Typography
            variant="body2"
            sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
          >
            {message.text}
          </Typography>
        </Box>
        {message.drawnShared > 0 && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: 0.25 }}
          >
            {UI_STRINGS.drawnShared(message.drawnShared)}
          </Typography>
        )}
      </Stack>
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
      {message.routes.map((summary, index) => (
        <RouteCard
          // The order is fixed once shown, and the color follows it
          // eslint-disable-next-line @eslint-react/no-array-index-key
          key={index}
          summary={summary}
          color={routeColor(index)}
          routeLayer={routeLayer}
          shownId={message.routesShownId}
          index={index}
        />
      ))}
      {message.download !== null && (
        <DownloadMenu
          gpx={message.download.gpx}
          onDownload={(format) => onDownload(message.id, format)}
        />
      )}
      {message.layers.length > 0 && (
        <LayerResultList
          items={message.layers}
          layerControl={layerControl}
          onGoToPlace={onGoToPlace}
        />
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

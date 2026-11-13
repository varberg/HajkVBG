import { useId, useState } from "react";

import {
  Box,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Tooltip,
} from "@mui/material";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";

import { DOWNLOAD_FORMATS, GPX_UNAVAILABLE, UI_STRINGS } from "./constants";
import type { DownloadMenuProps } from "./types";

/** Download what the answer drew on the map, in the format chosen */
function DownloadMenu({ gpx, onDownload }: DownloadMenuProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const menuId = useId();
  const open = anchor !== null;

  return (
    <Box>
      <Tooltip title={UI_STRINGS.downloadLabel}>
        <IconButton
          size="small"
          color="primary"
          onClick={(event) => setAnchor(event.currentTarget)}
          aria-label={UI_STRINGS.downloadLabel}
          aria-haspopup="menu"
          aria-controls={open ? menuId : undefined}
          aria-expanded={open}
        >
          <FileDownloadOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
      >
        {DOWNLOAD_FORMATS.map(({ format, name, hint }) => {
          const disabled = format === "gpx" && !gpx;
          return (
            <MenuItem
              key={format}
              disabled={disabled}
              onClick={() => {
                setAnchor(null);
                onDownload(format);
              }}
            >
              <ListItemText
                primary={name}
                secondary={disabled ? GPX_UNAVAILABLE : hint}
              />
            </MenuItem>
          );
        })}
      </Menu>
    </Box>
  );
}

export default DownloadMenu;

import type { ReactNode } from "react";

import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  List,
  ListItem,
  Typography,
} from "@mui/material";

import {
  useLayerState,
  useLayerVisibility,
} from "../../hooks/useLayerVisibility";
import type LayerControlModel from "../../models/LayerControlModel";

import { layerKey } from "./AiChatModel";
import { UI_STRINGS } from "./constants";
import type {
  LayerResultListProps,
  LayerSnapshot,
  PresentedLayer,
} from "./types";

interface RowProps {
  item: PresentedLayer & { id: string };
  layerControl: LayerControlModel;
}

/** Captions are often reused, so the group path is always shown too */
function LayerLabel({ item }: { item: PresentedLayer }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2">{item.caption}</Typography>
      {item.groupPath.length > 0 && (
        <Typography variant="caption" color="text.secondary" component="div">
          {item.groupPath.join(" › ")}
        </Typography>
      )}
    </Box>
  );
}

function isPartlyOn(
  id: string,
  state: LayerSnapshot,
  layerControl: LayerControlModel
): boolean {
  if (state.state !== undefined) {
    return state.state === "some";
  }
  // A sublayer address finds no layer here: it's either on or off
  const layer = layerControl.getLayer(id);
  if (layer?.get("layerType") !== "group" || !state.visible) {
    return false;
  }
  const visibleCount = state.visibleSubLayers?.length ?? 0;
  return visibleCount < (layer.get("allSubLayers")?.length ?? 0);
}

/**
 * MUI's Switch has no indeterminate state, so this is a Checkbox. Clicking a
 * partly visible item does what it does in the LayerSwitcher: a group layer
 * goes off, and a tree group folder goes fully on.
 */
function ToggleRow({ item, layerControl }: RowProps) {
  const state = useLayerState(layerControl, item.id) as LayerSnapshot;

  return (
    <FormControlLabel
      sx={{ m: 0, alignItems: "flex-start" }}
      label={<LayerLabel item={item} />}
      control={
        <Checkbox
          size="small"
          sx={{ p: 0.5, mr: 0.5 }}
          checked={state.visible}
          indeterminate={isPartlyOn(item.id, state, layerControl)}
          onChange={(e) =>
            layerControl.setLayerVisibility(item.id, e.target.checked)
          }
        />
      }
    />
  );
}

/** A background has no off switch: hiding one can leave the map without any */
function BackgroundRow({ item, layerControl }: RowProps) {
  const active = useLayerVisibility(layerControl, item.id);

  return (
    <>
      <LayerLabel item={item} />
      <Button
        size="small"
        disabled={active}
        sx={{ flexShrink: 0 }}
        onClick={() => layerControl.showLayer(item.id)}
      >
        {active ? UI_STRINGS.backgroundInUse : UI_STRINGS.useBackground}
      </Button>
    </>
  );
}

function PlaceRow({
  item,
  onGoToPlace,
}: {
  item: PresentedLayer;
  onGoToPlace: (name: string) => void;
}) {
  return (
    <>
      <LayerLabel item={item} />
      <Button
        size="small"
        variant="outlined"
        sx={{
          flexShrink: 0,
          minWidth: 0,
          py: 0,
          px: 1,
          fontSize: "0.75rem",
        }}
        onClick={() => onGoToPlace(item.caption)}
      >
        {UI_STRINGS.goToPlace}
      </Button>
    </>
  );
}

function LayerRow({
  item,
  layerControl,
  onGoToPlace,
}: {
  item: PresentedLayer;
  layerControl: LayerControlModel;
  onGoToPlace: (name: string) => void;
}): ReactNode {
  if (item.id === null || item.control === "none") {
    return <LayerLabel item={item} />;
  }
  if (item.control === "place") {
    return <PlaceRow item={item} onGoToPlace={onGoToPlace} />;
  }
  const row = { item: { ...item, id: item.id }, layerControl };
  return item.control === "background" ? (
    <BackgroundRow {...row} />
  ) : (
    <ToggleRow {...row} />
  );
}

function LayerResultList({
  items,
  layerControl,
  onGoToPlace,
}: LayerResultListProps) {
  return (
    <List dense disablePadding aria-label={UI_STRINGS.layerList}>
      {items.map((item) => (
        <ListItem
          key={layerKey(item)}
          disableGutters
          sx={{ justifyContent: "space-between", gap: 1, py: 0.25 }}
        >
          <LayerRow
            item={item}
            layerControl={layerControl}
            onGoToPlace={onGoToPlace}
          />
        </ListItem>
      ))}
    </List>
  );
}

export default LayerResultList;

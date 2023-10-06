import React from "react";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import Avatar from "@mui/material/Avatar";
import ImageIcon from "@mui/icons-material/MapTwoTone";
import Icon from "@mui/material/Icon";

const FeatureCollectionsListView = (props) => {
  const {
    featureCollections,
    selectedFeatureCollection,
    setSelectedFeatureCollection,
  } = props;

  return (
    <List>
      {featureCollections.map((fc, i) => {
        return (
          <ListItemButton
            key={i}
            selected={selectedFeatureCollection === fc.layerId}
            onClick={() => setSelectedFeatureCollection(fc.layerId)}
          >
            <ListItemAvatar>
              <Avatar>
                {fc.infoclickIcon.trim().length > 0 ? (
                  <Icon>{fc.infoclickIcon}</Icon>
                ) : (
                  <ImageIcon />
                )}
              </Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={fc.displayName}
              secondary={`${fc.numHits} träffar`}
            />
          </ListItemButton>
        );
      })}
    </List>
  );
};

export default FeatureCollectionsListView;

import React from "react";
import { withStyles } from "@material-ui/core/styles";
import {
  Box,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
} from "@material-ui/core";

const styles = (theme) => {
  return {};
};

class SnappingControl extends React.PureComponent {
  state = {
    checked: false,
    snapTargetName: "",
  };

  constructor(props) {
    super(props);
    this.localObserver = props.localObserver;
  }

  #toggleChecked = () => {
    this.setState(
      { checked: !this.state.checked },
      this.#toggleCheckedCallback
    );
  };

  #toggleCheckedCallback = () => {
    if (!this.state.snapTargetName) return;
    if (this.state.checked) {
      this.localObserver.publish(
        "mf-edit-supportLayer",
        this.state.snapTargetName
      );
      return;
    }
    this.localObserver.publish(
      "mf-edit-noSupportLayer",
      this.state.snapTargetName
    );
  };

  #handleChangeSnapLayer = (snapLayerName) => {
    let snapLayer = this.availableSnapLayers.find(
      (item) => item.name === snapLayerName
    );
    snapLayer.type = "snap";
    this.setState({ snapTargetName: snapLayerName }, () => {
      this.localObserver.publish("mf-edit-supportLayer", snapLayer);
    });
  };

  #createMenuOptions = (availableSnapLayers) => {
    this.availableSnapLayers = availableSnapLayers;
    return availableSnapLayers.map((layer, id) => {
      return (
        <MenuItem key={id} value={layer.name}>
          {layer.name}
        </MenuItem>
      );
    });
  };

  render() {
    const { enabled, availableSnapLayers } = this.props;
    return (
      <Box
        display="flex"
        style={{
          width: "100%",
        }}
      >
        <FormControlLabel
          disabled={!enabled}
          control={
            <Switch
              checked={this.state.checked}
              onChange={this.#toggleChecked}
              name="SnapToggle"
              color="primary"
            />
          }
          label="Snappa"
        />
        <FormControlLabel
          disabled={!enabled || !this.state.checked}
          labelPlacement="start"
          control={
            <Select
              style={{ minWidth: 120, paddingLeft: "8px" }}
              labelId="snap-layer-select-label"
              id="snap-layer-select"
              value={this.state.snapTargetName}
              onChange={(e) => {
                this.#handleChangeSnapLayer(e.target.value);
              }}
            >
              {this.#createMenuOptions(availableSnapLayers)}
            </Select>
          }
          label="Mot lager"
        />
      </Box>
    );
  }
}

export default withStyles(styles)(SnappingControl);

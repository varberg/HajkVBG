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
    snapTarget: "",
  };

  constructor(props) {
    super(props);
    console.log("props", props);
    this.localObserver = props.localObserver;
  }

  #toggleChecked = () => {
    this.setState(
      { checked: !this.state.checked },
      this.#toggleCheckedCallback
    );
  };

  #toggleCheckedCallback = () => {
    if (!this.state.snapTarget) return;
    if (this.state.checked)
      this.localObserver.publish("mf-snap-supportLayer", this.state.snapTarget);
    if (!this.state.checked)
      this.localObserver.publish(
        "mf-snap-noSupportLayer",
        this.state.snapTarget
      );
  };

  #handleChangeSnapLayer = (snapTarget) => {
    this.setState({ snapTarget: snapTarget });
    this.localObserver.publish("mf-snap-supportLayer", snapTarget);
  };

  #createMenuOptions = (availableSnapLayers) => {
    return availableSnapLayers.map((layer, id) => {
      return (
        <MenuItem key={id} value={layer}>
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
              style={{ minWidth: 120 }}
              labelId="snap-layer-select-label"
              id="snap-layer-select"
              value={this.state.snapTarget}
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

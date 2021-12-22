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
    snapLayerId: "",
  };

  #toggleChecked = () => {
    this.setState({ checked: !this.state.checked });
  };

  #handleChangeSnapLayer = (value) => {
    this.setState({ snapLayerId: value });
  };

  #createMenuOptions = (availableSnapLayers) => {
    return availableSnapLayers.map((layer) => {
      return (
        <MenuItem key={layer.id} value={layer.id}>
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
              value={this.state.snapLayerId}
              onChange={(e) => this.#handleChangeSnapLayer(e.target.value)}
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

SnappingControl.defaultProps = {
  enabled: true,
  availableSnapLayers: [
    { id: 1, name: "Fastigheter" },
    { id: 2, name: "Tillsynsobjekt" },
  ],
};

export default withStyles(styles)(SnappingControl);

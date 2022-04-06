import React from "react";
import { withStyles } from "@material-ui/core/styles";
import {
  Grid,
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@material-ui/core";
import { ToggleButton, ToggleButtonGroup } from "@material-ui/lab";
import AddIcon from "@material-ui/icons/Add";
import PictureInPictureIcon from "@material-ui/icons/PictureInPicture";
import RemoveIcon from "@material-ui/icons/Remove";

const styles = (theme) => {
  return {};
};

class CombineControl extends React.PureComponent {
  state = {
    combineTargetName: "",
    combineMethod: "union",
  };

  constructor(props) {
    super(props);
    this.localObserver = props.localObserver;
  }

  #handleCombineMethodChange = (event, newValue) => {
    this.setState({ combineMethod: newValue });
  };

  #handleChangeCombineLayer = (combineLayerName) => {
    let combineLayer = this.availableCombineLayers.find(
      (item) => item.name === combineLayerName
    );
    combineLayer.type = "combine";
    combineLayer.combineMethod = this.state.combineMethod;
    this.setState({ combineTargetName: combineLayerName }, () => {
      this.localObserver.publish("mf-edit-supportLayer", combineLayer);
    });
  };

  #createMenuOptions = (availableCombineLayers) => {
    this.availableCombineLayers = availableCombineLayers;
    return availableCombineLayers.map((layer, id) => {
      return (
        <MenuItem key={id} value={layer.name}>
          {layer.name}
        </MenuItem>
      );
    });
  };

  render() {
    const { availableCombineLayers } = this.props;
    return (
      <>
        <Grid item xs={12}>
          <Typography>
            Välj två angränsande objekt i kartan att kombinera till nytt objekt
          </Typography>
        </Grid>
        <Grid item xs={12}>
          <Box display="flex" style={{ marginTop: "8px", marginBottom: "8px" }}>
            <ToggleButtonGroup
              exclusive
              value={this.state.combineMethod}
              onChange={this.#handleCombineMethodChange}
            >
              <ToggleButton value="union">
                <AddIcon size="small" />
                <Typography noWrap variant="button">
                  &nbsp; Sammanfoga{" "}
                </Typography>
              </ToggleButton>
              <ToggleButton value="difference">
                <PictureInPictureIcon size="small" />
                <Typography noWrap variant="button">
                  &nbsp; Skärning{" "}
                </Typography>
              </ToggleButton>
              <ToggleButton value="clip">
                <RemoveIcon size="small" />
                <Typography noWrap variant="button">
                  &nbsp; Urklipp{" "}
                </Typography>
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Grid>
        <Grid item xs={12}>
          <FormControl margin="none">
            <InputLabel disableAnimation>Välj lager</InputLabel>
            <Select
              style={{ minWidth: 200 }}
              value={this.state.combineTargetName}
              onChange={(e) => this.#handleChangeCombineLayer(e.target.value)}
            >
              {this.#createMenuOptions(availableCombineLayers)}
            </Select>
          </FormControl>
        </Grid>
      </>
    );
  }
}

export default withStyles(styles)(CombineControl);

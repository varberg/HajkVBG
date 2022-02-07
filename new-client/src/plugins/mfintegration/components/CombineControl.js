import React from "react";
import { withStyles } from "@material-ui/core/styles";
import {
  Grid,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@material-ui/core";

const styles = (theme) => {
  return {};
};

class CombineControl extends React.PureComponent {
  state = {
    combineTargetName: "",
  };

  constructor(props) {
    super(props);
    this.localObserver = props.localObserver;
  }

  #handleChangeCombineLayer = (combineLayerName) => {
    let combineLayer = this.availableCombineLayers.find(
      (item) => item.name === combineLayerName
    );
    combineLayer.type = "combine";
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

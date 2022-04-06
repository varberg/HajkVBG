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

class CopyingControl extends React.PureComponent {
  state = {
    copyTargetName: "",
  };

  constructor(props) {
    super(props);
    this.localObserver = props.localObserver;
  }

  #handleChangeCopyLayer = (copyLayerName) => {
    let copyLayer = this.availableCopyLayers.find(
      (item) => item.name === copyLayerName
    );
    copyLayer.type = "copy";
    this.setState({ copyTargetName: copyLayerName }, () => {
      this.localObserver.publish("mf-edit-supportLayer", copyLayer);
    });
  };

  #createMenuOptions = (availableCopyLayers) => {
    this.availableCopyLayers = availableCopyLayers;
    return availableCopyLayers.map((layer, id) => {
      return (
        <MenuItem key={id} value={layer.name}>
          {layer.name}
        </MenuItem>
      );
    });
  };

  render() {
    const { availableCopyLayers, newFeatureExists } = this.props;
    return (
      <>
        <Grid item xs={12}>
          <Typography>
            Välj lager att kopiera från och klicka på ett objekt i kartan för
            att skapa en kopia.
          </Typography>
        </Grid>
        <Grid item xs={12}>
          <FormControl margin="none">
            <InputLabel disableAnimation>Välj lager</InputLabel>
            <Select
              style={{ minWidth: 200 }}
              value={this.state.copyTargetName}
              disabled={newFeatureExists}
              onChange={(e) => this.#handleChangeCopyLayer(e.target.value)}
            >
              {this.#createMenuOptions(availableCopyLayers)}
            </Select>
          </FormControl>
        </Grid>
      </>
    );
  }
}

export default withStyles(styles)(CopyingControl);

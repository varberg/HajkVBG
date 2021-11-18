import React from "react";
import PropTypes from "prop-types";
import { withSnackbar } from "notistack";
import { withStyles } from "@material-ui/core/styles";
import {
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@material-ui/core";
import ItemList from "./components/ItemList";
import { getMockData } from "./mockdata/mockdata";

const styles = (theme) => {
  return {
    dropdown: {
      width: "50%",
    },
    listHeading: {
      fontWeight: theme.typography.fontWeightMedium,
    },
  };
};

const defaultState = {
  mode: "realEstate",
  currentData: getMockData("realEstate"),
};

//TODO - Move this out to config.
const informationText =
  "Lorem, ipsum dolor sit amet consectetur adipisicing elit. Fugiat officiis quam incidunt cupiditate quisquam tempore minima cumque exercitationem omnis ratione!";

//TODO - move this? where to place constant information on the different modes - the model?
const modeDisplay = {
  realEstate: { displayName: "Fastighet", displayNamePlural: "Fastigheter" },
  coordinate: { displayName: "Koordinat", displayNamePlural: "Koordinater" },
  geometry: { displayName: "Geometri", displayNamePlural: "Geometrier" },
  controlObject: {
    displayName: "Tillsynsobjekt",
    displayNamePlural: "Tillsynsobjekt",
  },
};

class IntegrationView extends React.PureComponent {
  state = defaultState;

  static propTypes = {
    model: PropTypes.object.isRequired,
    app: PropTypes.object.isRequired,
    classes: PropTypes.object.isRequired,
    localObserver: PropTypes.object.isRequired,
    globalObserver: PropTypes.object.isRequired,
  };

  constructor(props) {
    super(props);

    this.globalObserver = props.globalObserver;
    this.localObserver = props.localObserver;
    this.bindSubscriptions();
  }

  bindSubscriptions = () => {
    this.localObserver.subscribe("window-opened", () => {
      console.log("IntegrationView - window-opened");
    });
  };

  toggleMode = (mode) => {
    this.setState({
      mode: mode,
      currentData: getMockData(mode),
    });
  };

  render() {
    const { classes } = this.props;
    return (
      <>
        <Typography>{informationText}</Typography>
        <br />
        <div>
          <FormControl className={classes.dropdown}>
            <InputLabel htmlFor="modeSelection">Välj objekt</InputLabel>
            <Select
              id="modeSelection"
              value={this.state.mode}
              onChange={(e) => {
                this.toggleMode(e.target.value);
              }}
            >
              <MenuItem value={"realEstate"}>Fastigheter</MenuItem>
              <MenuItem value={"coordinate"}>Koordinater</MenuItem>
              <MenuItem value={"geometry"}>Geometrier</MenuItem>
              <MenuItem value={"controlObject"}>Tillsynsobjekt</MenuItem>
            </Select>
          </FormControl>
        </div>
        <br />
        <br />
        <div>
          <Typography
            variant="subtitle1"
            className={classes.listHeading}
          >{`Markerade ${
            modeDisplay[this.state.mode]["displayNamePlural"]
          }`}</Typography>
          {this.state.currentData.length > 0
            ? this.state.currentData.map((item) => (
                <ItemList key={item.id} item={item} />
              ))
            : `Inga ${
                modeDisplay[this.state.mode]["displayNamePlural"]
              } valda.`}
        </div>
        <br />
        <br />
        <Button
          onClick={() => {
            this.props.model.testEdpConnection();
          }}
          color="primary"
          variant="contained"
        >
          Test koppla EDP
        </Button>
        <Button
          onClick={() => {
            this.props.model.drawPolygon();
          }}
          color="primary"
          variant="contained"
        >
          Test rita polygon
        </Button>
      </>
    );
  }
}

export default withStyles(styles)(withSnackbar(IntegrationView));

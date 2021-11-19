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
  ListItem,
} from "@material-ui/core";
import TouchAppIcon from "@material-ui/icons/TouchApp";
import Crop32Icon from "@material-ui/icons/Crop32";
import CancelOutlinedIcon from "@material-ui/icons/CancelOutlined";
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
    itemList: {
      maxHeight: 250,
      overflowY: "scroll",
      overflowX: "hidden",
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

  removeFromResults = (itemId) => {
    const updatedResults = this.state.currentData.filter(
      (item) => item.id !== itemId
    );
    this.setState({ currentData: updatedResults });
  };

  clearResults = () => {
    this.setState({ currentData: [] });
    //this.props.model.clearResults - do anything that needs doing on the model - e.g. clear from the visible layer.
  };

  render() {
    const { classes } = this.props;
    return (
      <>
        <Typography>{informationText}</Typography>
        <br />
        <div style={{ marginBottom: 20 }}>
          <FormControl className={classes.dropdown}>
            <InputLabel htmlFor="modeSelection">Välj kartobjekt</InputLabel>
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
        <div style={{ marginBottom: 20 }}>
          <Typography variant="subtitle1" className={classes.listHeading}>
            {`Markerade ${modeDisplay[this.state.mode]["displayNamePlural"]}`}
            {this.state.currentData.length > 0
              ? ` (${this.state.currentData.length})`
              : null}
          </Typography>
          <div>
            {this.state.currentData.length > 0 ? (
              <div className={classes.itemList}>
                {this.state.currentData.map((item) => (
                  <ItemList
                    key={item.id}
                    item={item}
                    listMode={this.state.mode}
                    handleRemoveItem={this.removeFromResults}
                  />
                ))}
              </div>
            ) : (
              `Inga ${modeDisplay[this.state.mode]["displayNamePlural"]} valda.`
            )}
          </div>
        </div>
        <div>
          <ListItem style={{ paddingLeft: "0px" }}>
            <Button
              startIcon={<TouchAppIcon />}
              onClick={() => {
                this.props.model.drawPoint();
              }}
              color="primary"
              variant="contained"
            >
              Markera/Avmarkera
            </Button>
          </ListItem>
          <ListItem style={{ paddingLeft: "0px" }}>
            <Button
              startIcon={<Crop32Icon />}
              onClick={() => {
                this.props.model.drawPolygon();
              }}
              color="primary"
              variant="contained"
            >
              Markera med polygon
            </Button>
          </ListItem>
          <ListItem style={{ paddingLeft: "0px" }}>
            <Button
              startIcon={<CancelOutlinedIcon />}
              onClick={() => {
                this.clearResults();
              }}
              color="primary"
              variant="contained"
            >
              Ta bort alla markeringar
            </Button>
          </ListItem>
        </div>
      </>
    );
  }
}

export default withStyles(styles)(withSnackbar(IntegrationView));

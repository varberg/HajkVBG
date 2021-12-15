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
  currentListResults: {
    realEstate: [],
    coordinate: [],
    geometry: [],
  },
};

//TODO - Move this out to config.
const informationText =
  "Detta verktyg används för att hantera kartobjekt som har en koppling till verksamhetssystemets poster för exempelvis tillsyn/kontroll och förorenade områden.";

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
    this.app = props.app;
    this.title = props.title;

    this.drawingSupport = this.#getDrawingSupportSettings();
    this.#bindSubscriptions();
  }

  #bindSubscriptions = () => {
    this.localObserver.subscribe("window-opened", () => {
      console.log("IntegrationView - window-opened");
      this.#initDrawingSupport();
    });
    this.localObserver.subscribe(
      "mf-wfs-map-updated-features-real-estates",
      (props) => {
        this.#updateRealEstateList(props);
      }
    );
    this.localObserver.subscribe(
      "mf-wfs-map-updated-features-coordinates",
      (props) => {
        this.#updateCoordinateList(props);
      }
    );
    this.localObserver.subscribe("mf-kubb-message-received", (message) => {
      this.props.enqueueSnackbar(`Inläsning av  ${message} från EDP Vision`, {
        variant: "info",
        persist: false,
      });
    });
    this.globalObserver.subscribe("core.closeWindow", (title) => {
      if (title !== this.title) return;
      this.#clearDrawingSupport();
      this.#clearAllDataSources();
    });
  };

  #initDrawingSupport = () => {
    this.#showDrawingSupport(this.drawingSupport[defaultState.mode]);
  };

  #showDrawingSupport = (layerId) => {
    const drawingSupportLayers = this.#getDrawingSupportLayer(layerId);
    if (drawingSupportLayers.length > 0)
      drawingSupportLayers[0].setVisible(true);
  };

  #hideDrawingSupport = (layerId) => {
    const drawingSupportLayers = this.#getDrawingSupportLayer(layerId);
    if (drawingSupportLayers.length > 0)
      drawingSupportLayers[0].setVisible(false);
  };

  #clearDrawingSupport = () => {
    this.#hideDrawingSupport(this.drawingSupport[this.state.mode]);
  };

  #clearAllDataSources = () => {
    this.#clearResultsRealEstate();
    this.#clearResultsCoordinates();
    this.props.model.clearHighlight();
  };

  #getDrawingSupportLayer = (layerId) => {
    if (!layerId) return [];
    const layers = this.app.map
      .getLayers()
      .getArray()
      .filter((layer) => layer.get("layerInfo"));
    return layers.filter((layer) => {
      if (layer.getProperties().name === layerId) return layer;
      return false;
    });
  };

  #updateRealEstateList = (props) => {
    let id = -1;
    const realEstateData = props.features.map((feature) => {
      const properties = feature.getProperties();
      return {
        id: ++id,
        fnr: properties[props.propertyName],
        name: properties.fastighet,
        municipality: properties.trakt,
        information: [
          {
            description: "Fastighetsnummer",
            value: properties[props.propertyName],
          },
          { description: "Trakt", value: properties.trakt },
        ],
        visible: true,
        selected: false,
        mapId: feature.ol_uid,
        feature: feature,
      };
    });
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        realEstate: realEstateData,
      },
    });
  };

  #updateCoordinateList = (props) => {
    let id = -1;
    const coordinateData = props.features.map((coordinate) => {
      const properties = coordinate.getProperties();
      const coordinateText =
        "(" +
        coordinate.getGeometry().flatCoordinates[0] +
        "; " +
        coordinate.getGeometry().flatCoordinates[1] +
        ")";
      const name =
        properties.label.length > 0 ? properties.label : coordinateText;
      return {
        id: ++id,
        name: name,
        information: [
          {
            description: "Label",
            value: properties.label.length > 0 ? properties.label : "-",
          },
          { description: "Koordinat", value: coordinateText },
        ],
        visible: true,
        selected: false,
        mapId: coordinate.ol_uid,
        feature: coordinate,
      };
    });
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        coordinate: coordinateData,
      },
    });
  };

  #toggleMode = (mode) => {
    this.#unselectAllFeatures(this.state.mode);
    this.#hideDrawingSupport(this.drawingSupport[this.state.mode]);
    this.setState({
      mode: mode,
    });
    this.#showDrawingSupport(this.drawingSupport[mode]);
    this.localObserver.publish("mf-new-mode", mode);
  };

  #unselectAllFeatures = (mode) => {
    this.state.currentListResults[mode].map((feature) => {
      feature.selected = false;
      return null;
    });
  };

  #clickRow = (clickedItem, mode) => {
    this.localObserver.publish("mf-item-list-clicked", clickedItem);

    let updateList = { ...this.state.currentListResults };
    let isSelected = !updateList[mode].find(
      (listItem) => listItem.id === clickedItem.id
    ).selected;

    const updatedResults = updateList[mode].map((listItem) => {
      if (listItem.id === clickedItem.id) {
        return { ...listItem, selected: isSelected };
      } else {
        return { ...listItem, selected: false };
      }
    });

    updateList[mode] = updatedResults;
    this.setState({ currentListResults: updateList });
  };

  #removeFromResults = (item, mode) => {
    let updateList = { ...this.state.currentListResults };
    const updatedResults = updateList[mode].filter(
      (listItem) => listItem.id !== item.id
    );

    updateList[mode] = updatedResults;
    this.setState({ currentListResults: updateList });

    this.props.model.removeItemFromActiveSource(item);
  };

  #clearResults = () => {
    if (this.state.mode === "realEstate") this.#clearResultsRealEstate();
    if (this.state.mode === "coordinate") this.#clearResultsCoordinates();
    this.props.model.clearHighlight();
  };

  toggleResultItemVisibility = (item, mode) => {
    let updateList = { ...this.state.currentListResults };
    let shouldBeVisible = !updateList[mode].find(
      (listItem) => listItem.id === item.id
    ).visible;

    const updatedResults = updateList[mode].map((listItem) => {
      if (listItem.id === item.id) {
        return { ...listItem, visible: shouldBeVisible };
      } else {
        return listItem;
      }
    });

    updateList[mode] = updatedResults;
    this.setState({ currentListResults: updateList });

    this.props.model.toggleFeatureStyleVisibility(
      item.feature,
      shouldBeVisible
    );
  };

  #clearResultsRealEstate = () => {
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        realEstate: [],
      },
    });
    this.props.model.clearResultsRealEstate();
  };

  #clearResultsCoordinates = () => {
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        coordinate: [],
      },
    });
    this.props.model.clearResultsCoordinate();
  };

  #getDrawingSupportSettings = () => {
    return {
      realEstate: "o83amu",
    };
  };

  render() {
    const { classes } = this.props;
    const { mode } = this.state;
    return (
      <>
        <Typography>{informationText}</Typography>
        <br />
        <div style={{ marginBottom: 20 }}>
          <FormControl className={classes.dropdown}>
            <InputLabel htmlFor="modeSelection">Välj kartobjekt</InputLabel>
            <Select
              id="modeSelection"
              value={mode}
              onChange={(e) => {
                this.#toggleMode(e.target.value);
              }}
            >
              <MenuItem value={"realEstate"}>Fastigheter</MenuItem>
              <MenuItem value={"coordinate"}>Koordinater</MenuItem>
              <MenuItem value={"geometry"}>Geometrier</MenuItem>
              <MenuItem value={"controlObject"}>Tillsynsobjekt</MenuItem>
            </Select>
          </FormControl>
        </div>
        <div style={{ marginBottom: 20, cursor: "pointer" }}>
          <Typography variant="subtitle1" className={classes.listHeading}>
            {`Markerade ${modeDisplay[mode]["displayNamePlural"]}`}
            {this.state.currentListResults[mode].length > 0
              ? ` (${this.state.currentListResults[mode].length})`
              : null}
          </Typography>
          <div>
            {this.state.currentListResults[mode].length > 0 ? (
              <div className={classes.itemList}>
                {this.state.currentListResults[mode].map((item) => (
                  <ItemList
                    key={item.id}
                    item={item}
                    listMode={mode}
                    handleClickItem={(clickedItem, mode) => {
                      this.#clickRow(clickedItem, mode);
                    }}
                    handleRemoveItem={(item, mode) => {
                      this.#removeFromResults(item, mode);
                    }}
                    handleToggleItemVisibilty={(item, mode) => {
                      this.toggleResultItemVisibility(item, mode);
                    }}
                  />
                ))}
              </div>
            ) : (
              `Inga ${modeDisplay[mode]["displayNamePlural"]} valda.`
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
                this.#clearResults();
              }}
              color="primary"
              variant="contained"
            >
              Ta bort alla markeringar
            </Button>
          </ListItem>
          {this.state.mode === "realEstate" ? (
            <ListItem style={{ paddingLeft: "0px" }}>
              <Button
                startIcon={<CancelOutlinedIcon />}
                onClick={() => {
                  this.props.model.testRealEstatesFromKUBB();
                }}
                color="primary"
                variant="contained"
              >
                Fejk-KUBB: Testa fastigheter
              </Button>
            </ListItem>
          ) : null}
          {this.state.mode === "coordinate" ? (
            <ListItem style={{ paddingLeft: "0px" }}>
              <Button
                startIcon={<CancelOutlinedIcon />}
                onClick={() => {
                  this.props.model.testCoordinatesFromKUBB();
                }}
                color="primary"
                variant="contained"
              >
                Fejk-KUBB: Testa koordinater
              </Button>
            </ListItem>
          ) : null}
        </div>
      </>
    );
  }
}

export default withStyles(styles)(withSnackbar(IntegrationView));

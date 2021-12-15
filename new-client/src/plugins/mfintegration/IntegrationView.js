import React from "react";
import PropTypes from "prop-types";
import { withSnackbar } from "notistack";
import { withStyles } from "@material-ui/core/styles";
import {
  Container,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ListItem,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Paper,
  Tabs,
  Tab,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Divider,
} from "@material-ui/core";
import CancelOutlinedIcon from "@material-ui/icons/CancelOutlined";
import ItemList from "./components/ItemList";
import ExpandMore from "@material-ui/icons/ExpandMore";
import { ToggleButtonGroup, ToggleButton } from "@material-ui/lab";
import ListToolbar from "./components/ListToolbar";

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
    gridContainer: {
      margin: "0px",
      paddingLeft: "0px",
    },
    accordionSummary: {},
    accordionDetails: {},
    paper: {},
    tabs: {},
    editContainer: { backgroundColor: "#F3F3F3" },
  };
};

const defaultState = {
  mode: "realEstate",
  currentListResults: {
    realEstate: [],
    coordinate: [],
    geometry: [],
  },
  editTab: "create",
  editMode: "none",
  listToolsMode: "none",
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

  #endListToolsMode = (listToolsMode) => {
    if (listToolsMode === "pointselect") {
      this.props.model.endDrawPoint();
    }

    if (listToolsMode === "polygonselect") {
      this.props.model.endDrawPolygon();
    }
  };

  #startListToolsMode = (listToolsMode) => {
    if (listToolsMode === "pointselect") {
      this.props.model.drawPoint();
    }

    if (listToolsMode === "polygonselect") {
      this.props.model.drawPolygon();
    }
  };

  renderListTools = () => {
    return (
      <ListToolbar
        listToolsMode={this.state.listToolsMode}
        handleClearResults={() => {
          this.#clearResults();
        }}
        handleUpdateListToolsMode={(newMode) => {
          this.setState({ listToolsMode: newMode });
        }}
      />
    );
  };

  componentDidUpdate(prevProps, prevState) {
    //keep track of the mode that the list tools are in.
    if (prevState.listToolsMode !== this.state.listToolsMode) {
      let previousMode = prevState.listToolsMode;
      this.#endListToolsMode(previousMode);
      this.#startListToolsMode(this.state.listToolsMode);
    }
  }

  render() {
    const { classes } = this.props;
    const { mode } = this.state;
    return (
      <Container disableGutters>
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
          <Grid container>{this.renderListTools()}</Grid>
          <Divider style={{ marginTop: "16px" }} />
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
        {/* editing menu */}
        <div>
          <Accordion elevation={0}>
            <AccordionSummary
              expandIcon={<ExpandMore />}
              className={classes.accordionSummary}
            >
              <Typography>Redigera</Typography>
            </AccordionSummary>
            <AccordionDetails className={classes.accordionDetails}>
              <Grid container className={classes.editContainer}>
                <Grid item xs={12}>
                  <Paper className={classes.paper} square elevation={0}>
                    <Tabs
                      className={classes.tabs}
                      value={this.state.editTab}
                      variant="fullWidth"
                      indicatorColor="primary"
                      textColor="primary"
                      onChange={(e, newValue) => {
                        this.setState({ editTab: newValue });
                      }}
                    >
                      <Tab value="create" label="Skapa nytt"></Tab>
                      <Tab value="update" label="Ändra"></Tab>
                    </Tabs>
                  </Paper>
                </Grid>
                <Grid item xs={12}>
                  <Stepper orientation="vertical" style={{ padding: 8 }}>
                    <Step key="changeObject">
                      <StepLabel>Ändra objekt</StepLabel>
                      <StepContent>
                        <Grid container item>
                          <Grid item xs={12}></Grid>
                          <ToggleButtonGroup
                            value={this.state.editMode}
                            exclusive
                            onChange={(e, newValue) => {
                              this.setState({ editMode: newValue });
                            }}
                          >
                            <ToggleButton value="draw">Rita</ToggleButton>
                            <ToggleButton value="copy">Kopiera</ToggleButton>
                            <ToggleButton value="combine">
                              Kombinera
                            </ToggleButton>
                          </ToggleButtonGroup>
                        </Grid>
                      </StepContent>
                    </Step>
                    <Step key="changeAttributes">
                      <StepLabel>Ange attribut</StepLabel>
                      <StepContent></StepContent>
                    </Step>
                    <Step key="confirm">
                      <StepLabel>Klart</StepLabel>
                      <StepContent></StepContent>
                    </Step>
                  </Stepper>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        </div>
      </Container>
    );
  }
}

export default withStyles(styles)(withSnackbar(IntegrationView));

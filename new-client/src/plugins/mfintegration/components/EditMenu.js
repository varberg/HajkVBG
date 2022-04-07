import React from "react";
import PropTypes from "prop-types";
import { withStyles } from "@material-ui/core/styles";
import {
  Typography,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tab,
  Tabs,
  Paper,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Tooltip,
  ButtonGroup,
  Button,
  Box,
} from "@material-ui/core";
import { ToggleButton } from "@material-ui/lab";
import ExpandMore from "@material-ui/icons/ExpandMore";
import ChevronLeftIcon from "@material-ui/icons/ChevronLeft";
import DeleteIcon from "@material-ui/icons/Delete";
import OpenWithIcon from "@material-ui/icons/OpenWith";
import FormatShapesIcon from "@material-ui/icons/FormatShapes";
import CloseIcon from "@material-ui/icons/Close";
import CopyingControl from "./CopyingControl";
import CombineControl from "./CombineControl";
import SnappingControl from "./SnappingControl";

const styles = (theme) => {
  return {
    accordionDetails: { paddingLeft: "0px" },
    stepper: { padding: "0px" },

    //equally size toggle buttons within the stepper.
    stepButtonGroup: {
      flex: "1 1 0",
      width: 0,
    },
    toggleButton: {
      color:
        theme.palette.type === "dark"
          ? theme.palette.common.white
          : theme.palette.action.active,
    },
  };
};

//The existing Mui ToggleButtonGroup and Toggle buttons do not handle being wrapped in a Tooltip.
//this TooltipToggleButton components allows using a tooltip on togglebuttons.
const TooltipToggleButton = ({ children, title, ...props }) => (
  <Tooltip title={title}>
    <ToggleButton {...props}>{children}</ToggleButton>
  </Tooltip>
);

const StyledAccordionSummary = withStyles({
  root: {
    borderTop: "1px solid rgba(0, 0, 0, .125)",
    borderBottom: "1px solid rgba(0, 0, 0, .125)",
    minHeight: 56,
    "&$expanded": {
      minHeight: 56,
    },
  },
  content: {
    "&$expanded": {
      margin: "8px 0",
    },
  },
  expanded: {},
})(AccordionSummary);

const defaultState = {
  activeStepCreate: 0,
  activeStepUpdate: null,
  isEditMenuOpen: false,
  editTab: "create", //create, update
  editMode: "none", //new, copy, combine
  chosenUpdateTool: null, //modify, move, delete
  drawActive: false,
  activeCombineLayer: "",
  createSessionInProgress: false,
  updateSessionInProgress: false,
};

class EditMenu extends React.PureComponent {
  state = defaultState;

  static propTypes = {
    model: PropTypes.object.isRequired,
    currentSelection: PropTypes.array.isRequired,
    selectionExists: PropTypes.bool.isRequired,
    layerMode: PropTypes.string.isRequired,
  };

  constructor(props) {
    super(props);
    this.localObserver = props.localObserver;
    this.#bindSubscriptions();
  }

  #bindSubscriptions = () => {
    this.localObserver.subscribe("mf-edit-supportLayer", (layer) => {
      this.supportLayer = layer;
    });
    this.localObserver.subscribe("mf-window-closed", () => {
      this.#resetEditMenu(true);
    });
  };

  #getEditInfoText = (isCreateMode) => {
    if (isCreateMode) {
      return "Ett nytt kartobjekt har skapats. Gå över till EDP Vision för att spara det nya kartobjektet till rätt post.";
    } else {
      return "Kartobjektet har ändrats. Gå över till EDP Vision för att spara det ändrade kartobjektet till rätt post.";
    }
  };

  #getEditModeDisplayName = (editMode) => {
    let editModedisplayNames = {
      new: "(Rita)",
      copy: "(Kopiera)",
      combine: "(Kombinera)",
    };

    let displayName = editModedisplayNames[editMode] || "";
    return displayName;
  };

  #resetEditMenu = (shouldClose) => {
    this.props.model.abortDrawFeature(this.state.editMode);
    this.props.model.clearInteractions();
    this.setState({ ...defaultState, isEditMenuOpen: !shouldClose });
  };

  #toggleisEditMenuOpen = () => {
    this.setState({ isEditMenuOpen: !this.state.isEditMenuOpen });
  };

  #getAvailableWfsLayers = () => {
    let mapModes = this.props.model.options.mapObjects;
    let availableLayers = [];

    Object.keys(mapModes).forEach((key) => {
      if (mapModes[key].wmsId) {
        availableLayers.push({
          sourceName: key,
          layerId: mapModes[key].wmsId,
          name: mapModes[key].displayNamePl,
        });
      }
    });
    return availableLayers;
  };

  #handleCancelStepUpdateFeatures = (editMode) => {
    if (this.state.editTab === "create") {
      this.setState({
        activeStepCreate: 0,
        editMode: "none",
        chosenUpdateTool: null,
      });
      this.props.localObserver.publish("mf-end-draw-new-geometry", {
        editMode: editMode,
        saveGeometry: false,
      });
      this.props.localObserver.publish(
        "mf-edit-noSupportLayer",
        this.supportLayer
      );
    }

    if (this.state.editTab === "update") {
      this.setState({
        activeStepUpdate: 0,
      });
    }
  };

  #handleConfirmStepUpdateFeatures = (editMode) => {
    //If we are in the create tab
    if (this.state.editTab === "create") {
      this.setState({
        activeStepCreate: 2,
        chosenUpdateTool: null,
      });
      this.props.localObserver.publish("mf-end-draw-new-geometry", {
        editMode: editMode,
        saveGeometry: true,
      });
      this.props.localObserver.publish(
        "mf-edit-noSupportLayer",
        this.supportLayer
      );
    }

    //If we are in the update tab
    if (this.state.editTab === "update") {
      this.setState({ activeStepUpdate: 1 });
      this.props.localObserver.publish("mf-end-draw-new-geometry", {
        editMode: editMode,
        saveGeometry: true,
      });
      this.props.localObserver.publish(
        "mf-edit-noSupportLayer",
        this.supportLayer
      );
    }
  };

  #handleMakeMoreChanges = () => {
    if (this.state.editTab === "create") {
      this.setState({ activeStepCreate: 0 });
    }

    if (this.state.editTab === "update") {
      this.setState({ activeStepUpdate: 0 });
    }
  };

  #handleBeginUpdate = () => {
    console.log("#handleBeginUpdate");
    const { model, layerMode, currentSelection } = this.props;

    //1. Find the selected item (what happens if the user deselects the selected item once in the update tab?)
    // this.state.currentSelection. We need to clone the feature so we don't have the same OpenLayers id.
    const selectedFeature = currentSelection[0].feature;
    let clonedFeature = selectedFeature.clone();

    //2. copy the selected item into the correct editSource.
    model.editSources.new.clear(); //may not be needed.
    this.props.model.editSources.new.addFeature(clonedFeature);

    //3. Hide the existing selected item, so it doesn't obscure the item being edited.
    //use  #hideItem function in the model.

    //Make the the buttons respond (in create they response to newFeatureExists).

    //4. Use the same logic as in create (checking if there is a newFeature) in order to know where the 'flytta, radera' should be tända.
    //For this we will have to tweak the disabled settings of the buttons (possibly separate render for update).

    //4. What happens when we delete?
    //5. What happens when we save?

    // If the user deselects the selected item, while they are editing, the edits should be cancelled and remain in the same step.
    // If the user changes the selection,
    // If there is no selected item, the buttons should not be available.
  };

  #handleDeleteNewEdit = (editMode) => {
    //Delete is handled differently to the the other update tools (move, modify).
    this.setState({ chosenUpdateTool: "edit" }, () => {
      this.props.handleDeleteNewEdit(editMode);
    });
  };

  #handleChangeUpdateTool = (chosenTool, editMode) => {
    //If we are switching tools, or activating a new tool.
    if (chosenTool !== this.state.chosenUpdateTool) {
      this.setState({ chosenUpdateTool: chosenTool }, () => {
        this.props.handleChangeUpdateTool(chosenTool, editMode);
      });

      //If we are de-activating the currently chosen tool.
    } else {
      this.setState({ chosenUpdateTool: null });
      this.props.handleChangeUpdateTool(null, editMode);
    }
  };

  #renderCustomEditModeControl = (editMode) => {
    const { newFeature } = this.props;
    const newFeatureExists = newFeature?.features?.length > 0;
    if (editMode === "copy") {
      return (
        <Grid item xs={12}>
          <CopyingControl
            availableCopyLayers={this.#getAvailableWfsLayers()}
            localObserver={this.props.localObserver}
            newFeatureExists={newFeatureExists}
          />
        </Grid>
      );
    }
    if (editMode === "combine") {
      return (
        <Grid item xs={12}>
          <CombineControl
            availableCombineLayers={this.#getAvailableWfsLayers()}
            localObserver={this.props.localObserver}
          />
        </Grid>
      );
    }
    if (editMode === "new") {
      return (
        <Grid item xs={12}>
          <Typography>Rita ut det nya objektet i kartan.</Typography>
        </Grid>
      );
    }
    return null;
  };

  //The first step when in 'create' mode. Choose which method will be used in the next step.
  //This step is only used in 'create', not in 'update'.
  renderStepChooseCreateMode = () => {
    const { classes, copyEditMode, combineEditMode, localObserver } =
      this.props;
    const disableCopy = copyEditMode !== "point";
    const disableCombine = combineEditMode !== "point";
    return (
      <Grid container item xs={12}>
        <ButtonGroup style={{ width: "100%" }}>
          <Tooltip title="Rita nytt objekt">
            <Button
              className={classes.stepButtonGroup}
              aria-label="Rita nytt objekt"
              onClick={() => {
                this.setState({
                  activeStepCreate: 1,
                  editMode: "new",
                  createSessionInProgress: true,
                });
                this.setState({ drawActive: true }, () => {
                  localObserver.publish("mf-start-draw-new-geometry");
                });
              }}
            >
              Rita
            </Button>
          </Tooltip>
          <Tooltip title="Kopiera befintlig objekt">
            <Button
              disabled={disableCopy}
              className={classes.stepButtonGroup}
              aria-label="Kopiera befintlig objekt"
              onClick={() => {
                this.setState({
                  activeStepCreate: 1,
                  editMode: "copy",
                  createSessionInProgress: true,
                });
              }}
            >
              Kopiera
            </Button>
          </Tooltip>
          <Tooltip title="Kombinera befintliga objekt">
            <Button
              disabled={disableCombine}
              className={classes.stepButtonGroup}
              aria-label="Kombinera befintliga objekt"
              onClick={() => {
                this.setState({
                  activeStepCreate: 1,
                  editMode: "combine",
                  createSessionInProgress: true,
                });
              }}
            >
              Kombinera
            </Button>
          </Tooltip>
        </ButtonGroup>
      </Grid>
    );
  };

  renderStepUpdateFeatures = (editMode) => {
    const { classes, localObserver, newFeature } = this.props;
    const newFeatureExists = newFeature?.features?.length > 0;
    const shouldShowSnappingControls = editMode === "new";
    const shouldShowUpdateControls = editMode !== "combine";

    const cancelButton =
      this.state.editTab === "update" ? (
        <Tooltip title="Ångra alla ändringar">
          <Button
            className={classes.stepButtonGroup}
            onClick={() => this.#handleCancelStepUpdateFeatures(editMode)}
            aria-label="Ångra"
          >
            Ångra
          </Button>
        </Tooltip>
      ) : (
        <Tooltip title="Tillbaka till föregående steg">
          <Button
            className={classes.stepButtonGroup}
            startIcon={<ChevronLeftIcon />}
            onClick={() => this.#handleCancelStepUpdateFeatures(editMode)}
            aria-label="Tillbaka"
          >
            Tillbaka
          </Button>
        </Tooltip>
      );

    return (
      <Grid container item xs={12} spacing={(2, 2)}>
        {/* Custom mode instructions and custom mode control, this differs depending on whether we are in 'create', 'copy' or 'combine'.*/}
        {this.#renderCustomEditModeControl(editMode)}

        {/* Snapping control, used only in draw new mode, not in copy or combine */}
        {shouldShowSnappingControls && (
          <Grid item xs={12}>
            <SnappingControl
              enabled={true}
              availableSnapLayers={this.#getAvailableWfsLayers()}
              localObserver={localObserver}
            />
          </Grid>
        )}

        {/*Controls to edit created object (move, modify, delete)*/}
        {shouldShowUpdateControls && (
          <Grid item xs={12}>
            {this.renderUpdateFeatureControls(editMode)}
          </Grid>
        )}

        {/*Submit and go back controls.*/}
        <Grid item xs={12}>
          <Box display="flex">
            <ButtonGroup style={{ width: "100%" }}>
              {cancelButton}
              <Button
                className={classes.stepButtonGroup}
                disabled={!newFeatureExists}
                onClick={() => this.#handleConfirmStepUpdateFeatures(editMode)}
                aria-label="OK"
              >
                Ok
              </Button>
            </ButtonGroup>
          </Box>
        </Grid>
      </Grid>
    );
  };

  renderUpdateFeatureControls = () => {
    //The behaviour of the tools will vary based on whether we are in 'Create' or 'Update' tab in the edit menu*/

    //Are we in update or create mode?
    const inUpdateTab = this.state.editTab === "update";

    const { classes, newFeature } = this.props;
    const newFeatureExists = newFeature?.features?.length > 0;
    return (
      <Box display="flex">
        <Box>
          <Box style={{ marginLeft: "0px" }}>
            <Tooltip
              title="Omforma befintlig redigering"
              aria-label="Omforma befintlig redigering"
            >
              <ToggleButton
                className={classes.toggleButton}
                disabled={!newFeatureExists}
                value="modify"
                selected={this.state.chosenUpdateTool === "modify"}
                onChange={(e, newValue) => {
                  e.preventDefault();
                  this.#handleChangeUpdateTool(newValue, this.state.editMode);
                }}
              >
                <FormatShapesIcon size="small" />
                <Typography noWrap variant="button">
                  &nbsp; Omforma{" "}
                </Typography>
              </ToggleButton>
            </Tooltip>
          </Box>
        </Box>
        <Box>
          <Box style={{ marginLeft: "0px" }}>
            <Tooltip
              title="Flytta befintlig redigering"
              aria-label="Flytta befintlig redigering"
            >
              <ToggleButton
                className={classes.toggleButton}
                disabled={!newFeatureExists}
                value="move"
                selected={this.state.chosenUpdateTool === "move"}
                onChange={(e, newValue) => {
                  e.preventDefault();
                  this.#handleChangeUpdateTool(newValue, this.state.editMode);
                }}
              >
                <OpenWithIcon size="small" />
                <Typography noWrap variant="button">
                  &nbsp; Flytta{" "}
                </Typography>
              </ToggleButton>
            </Tooltip>
          </Box>
        </Box>
        <Box>
          <Box style={{ marginLeft: "0px" }}>
            <Tooltip
              title="Radera befintlig redigering"
              aria-label="Radera befintlig redigering"
            >
              <ToggleButton
                className={classes.toggleButton}
                disabled={!newFeatureExists}
                value="delete"
                selected={this.state.chosenUpdateTool === "delete"}
                onChange={(e, newValue) => {
                  e.preventDefault();
                  this.#handleDeleteNewEdit(this.state.editMode);
                }}
              >
                <DeleteIcon size="small" />
                <Typography noWrap variant="button">
                  &nbsp; Radera{" "}
                </Typography>
              </ToggleButton>
            </Tooltip>
          </Box>
        </Box>
      </Box>
    );
  };

  renderStepConfirm = (editMode) => {
    const informationText = this.#getEditInfoText(
      this.state.editTab === "create"
    );
    const { classes } = this.props;
    return (
      <Grid container item xs={12}>
        <Grid item xs={12}>
          <Typography paragraph>{informationText}</Typography>
        </Grid>
        <Grid item xs={12} style={{ marginTop: "16px" }}>
          <Box display="flex">
            <ButtonGroup style={{ width: "100%" }}>
              <Button
                className={classes.stepButtonGroup}
                onClick={() => this.#handleMakeMoreChanges(editMode)}
              >
                Skapa Fler
              </Button>
              <Button
                className={classes.stepButtonGroup}
                onClick={() => {
                  this.#resetEditMenu(true);
                }}
              >
                Avsluta
              </Button>
            </ButtonGroup>
          </Box>
        </Grid>
      </Grid>
    );
  };

  renderCreateStepper = () => {
    const { classes } = this.props;
    return (
      <Stepper
        activeStep={this.state.activeStepCreate}
        orientation="vertical"
        className={classes.stepper}
      >
        <Step key="selectMethod">
          <StepLabel>Välj metod</StepLabel>
          <StepContent>{this.renderStepChooseCreateMode()}</StepContent>
        </Step>
        <Step key="createObject">
          <StepLabel>{`Skapa ${this.#getEditModeDisplayName(
            this.state.editMode
          )}`}</StepLabel>
          {this.#getEditModeDisplayName(this.state.editMode)}
          <StepContent>
            {this.renderStepUpdateFeatures(this.state.editMode)}
          </StepContent>
        </Step>
        <Step key="confirm">
          <StepLabel>Klart</StepLabel>
          <StepContent>
            {this.renderStepConfirm(this.state.editMode)}
          </StepContent>
        </Step>
      </Stepper>
    );
  };

  renderUpdateStepper = () => {
    const { classes } = this.props;
    return (
      <Stepper
        activeStep={this.state.activeStepUpdate}
        orientation="vertical"
        className={classes.stepper}
      >
        <Step key="createObject">
          <StepLabel>{`Skapa ${this.#getEditModeDisplayName(
            this.state.editMode
          )}`}</StepLabel>
          {this.#getEditModeDisplayName(this.state.editMode)}
          <StepContent>
            {this.renderStepUpdateFeatures(this.state.editMode)}
          </StepContent>
        </Step>
        <Step key="confirm">
          <StepLabel>Klart</StepLabel>
          <StepContent>
            {this.renderStepConfirm(this.state.editMode)}
          </StepContent>
        </Step>
      </Stepper>
    );
  };

  renderStepper = (editTab) => {
    if (editTab === "create") return this.renderCreateStepper();
    if (editTab === "update") return this.renderUpdateStepper();
  };

  componentDidUpdate(prevProps, prevState) {
    //When the layerMode (the selected layer type, e.g. 'fastighet', 'område') is changed, we need to reset the edit, otherwise the user may end up editing an incorrect layer.
    if (prevProps.layerMode !== this.props.layerMode) {
      let editShouldClose = true;
      this.#resetEditMenu(editShouldClose);
    }

    /*Handle changes related to the open/closed state of the Editing menu.*/
    if (prevState.isEditMenuOpen !== this.state.isEditMenuOpen) {
      //When we open the edit menu, we decide which tab we should be in by default. If we have a selected item, we should default to the 'Ändra' tab.
      if (this.props.selectionExists) {
        this.setState({ editTab: "update" });
      }

      //If we are in the 'Ändra' tab when we open the menu, we want to jump into the first step.
      if (this.state.isEditMenuOpen && this.state.editTab === "update") {
        this.setState({ activeStepUpdate: 0 });
      }

      //When the edit panel gets closed, reset the edit menu.
      if (!this.state.isEditMenuOpen) this.#resetEditMenu(true);

      //Let IntegrationView know that edit has toggled, so we can disable parts of the main menu that should not be used while editing.
      this.props.handleUpdateIsEditMenuOpen(this.state.isEditMenuOpen);
    }

    /*Handle changes related to which edit menu Tab is selected*/
    if (prevState.editTab !== this.state.editTab) {
      //If we enter the editTab, while the edit menu is open, we should go into the first (0th) step.
      if (this.state.editTab === "update" && this.state.isEditMenuOpen) {
        this.setState({ activeStepUpdate: 0 });
      }
    }

    if (prevState.activeStepUpdate !== this.state.activeStepUpdate) {
      //We need to know when we have entered the first step of the update menu.
      if (this.state.activeStepUpdate === 0) {
        this.#handleBeginUpdate();
      }
    }
  }

  render() {
    const { classes, layerMode, newFeature } = this.props;
    const layerModeEditable =
      this.props.model.options.mapObjects[layerMode].editable;

    let editdisabled =
      this.state.isEditMenuOpen === false && !layerModeEditable;

    return (
      <Grid item container xs={12}>
        <Accordion
          disabled={editdisabled}
          component={editdisabled ? "div" : undefined}
          elevation={0}
          expanded={this.state.isEditMenuOpen}
          className={classes.accordion}
          onChange={() => {
            this.#toggleisEditMenuOpen();
          }}
        >
          <Tooltip
            title={
              editdisabled
                ? "Den valda objekttyp går inte att redigera"
                : "Öppna redigeringsmenyn"
            }
            aria-label="Öppna redigeringsmenyn"
          >
            <div>
              <StyledAccordionSummary
                expandIcon={
                  this.state.isEditMenuOpen ? <CloseIcon /> : <ExpandMore />
                }
              >
                <Typography>Redigera</Typography>
              </StyledAccordionSummary>
            </div>
          </Tooltip>
          <AccordionDetails className={classes.accordionDetails}>
            <Grid item container>
              <Grid item xs={12}>
                <Paper square elevation={2}>
                  <Tabs
                    className={classes.tabs}
                    value={this.state.editTab}
                    variant="fullWidth"
                    indicatorColor="secondary"
                    textColor="primary"
                    onChange={(e, newValue) => {
                      this.setState({ editTab: newValue });
                    }}
                  >
                    <Tab
                      value="create"
                      label="Skapa nytt"
                      disabled={this.state.updateSessionInProgress}
                    ></Tab>
                    <Tab
                      value="update"
                      label="Ändra"
                      disabled={
                        !this.props.selectionExists ||
                        this.state.createSessionInProgress
                      }
                    ></Tab>
                  </Tabs>
                </Paper>
              </Grid>
              <Grid item xs={12} style={{ marginTop: "8px" }}>
                {this.renderStepper(this.state.editTab)}
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      </Grid>
    );
  }
}

export default withStyles(styles)(EditMenu);

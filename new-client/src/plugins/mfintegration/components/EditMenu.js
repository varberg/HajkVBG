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
  editMode: "none", //new, copy, combine
  chosenUpdateTool: null, //modify, move, delete
  drawActive: false,
  activeCombineLayer: "",
  updateFeatureActive: false,
};

class EditMenu extends React.PureComponent {
  state = defaultState;

  static propTypes = {
    model: PropTypes.object.isRequired,
    currentSelection: PropTypes.array.isRequired,
    selectionExists: PropTypes.bool.isRequired,
    layerMode: PropTypes.string.isRequired,
    editTab: PropTypes.string.isRequired,
    featureUpdateInProgress: PropTypes.bool.isRequired,
    handleUpdateIsEditMenuOpen: PropTypes.func.isRequired,
    isEditMenuOpen: PropTypes.bool.isRequired,
    createSessionInProgress: PropTypes.bool.isRequired,
    updateSessionInProgress: PropTypes.bool.isRequired,
    toggleSessionInProgress: PropTypes.func.isRequired,
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
    //TODO - do this more nicely, probably in the main view.
    //clear any items that are being created/updated from the new source.
    this.props.model.editSources.new.clear();
    this.props.model.abortDrawFeature(this.state.editMode);
    this.props.model.clearInteractions();
    this.props.handleUpdateIsEditMenuOpen(!shouldClose);
    this.props.toggleSessionInProgress("create", false);
    this.props.toggleSessionInProgress("update", false);
    this.props.handleChangeEditTab("create");
    this.setState({ ...defaultState });
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
    this.props.toggleSessionInProgress("create", false);
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
  };

  #handleConfirmStepUpdateFeatures = (editMode) => {
    const { model, editTab } = this.props;
    //If we are in the create tab
    if (editTab === "create") {
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
    if (editTab === "update") {
      //Clear any remaining update interactions from the previous step.
      model.clearUpdateInteractions();

      let updateFeature = model.editSources.new.getFeatures()[0];
      updateFeature.isNew = true;

      this.setState({ activeStepUpdate: 1, chosenUpdateTool: null });
      this.props.localObserver.publish("mf-end-update-geometry", {
        editMode: editMode,
        saveGeometry: true,
        features: [updateFeature],
      });
      this.props.localObserver.publish(
        "mf-edit-noSupportLayer",
        this.supportLayer
      );
    }
  };

  #handleMakeMoreChanges = () => {
    if (this.props.editTab === "create") {
      this.props.toggleSessionInProgress("create", false);
      this.setState({ activeStepCreate: 0 });
    }

    if (this.props.editTab === "update") {
      this.setState({ activeStepUpdate: 0 });
    }
  };

  #handleResetUpdate = () => {
    //Set some state, make sure that we cancel any chosenUpdateTool is cancelled.
    this.setState({ chosenUpdateTool: null });
    this.#handleBeginUpdate(true);
  };

  #handleBeginUpdate = (isReset = false) => {
    this.props.toggleSessionInProgress("update", true);
    const { model, currentSelection } = this.props;

    //clear any existing update interactions (if we are resetting, this is needed).
    model.clearUpdateInteractions();

    //Find the selected item and clone - we need to clone the feature so we don't have the same OpenLayers id.
    const selectedFeature = currentSelection[0].feature;
    const clonedFeature = selectedFeature.clone();
    //If the feature was hidden when cloned, it gets an invisible style, so correct this.
    model.setFeatureStyle(clonedFeature, null);
    //clonedFeature.setStyle(null);

    //Copy the selected item into the correct editSource.
    model.editSources.new.clear();
    model.editSources.new.addFeature(clonedFeature);
    model.updatedFeature = clonedFeature;

    //If we are starting the update, hide the existing selected item, so it doesn't obscure the item being edited.
    if (!isReset) {
      model.hideItem(selectedFeature);
    }

    this.setState({ updateFeatureActive: true });
  };

  #handleDeleteEdit = (editMode) => {
    //Delete is handled differently to the the other update tools (move, modify).
    this.setState({ chosenUpdateTool: "edit" }, () => {
      this.props.handleDeleteEdit(editMode);
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

  #moveToCreateStep = (editMode) => {
    this.props.toggleSessionInProgress("create", true);
    this.setState({ activeStepCreate: 1, editMode: editMode });
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
                this.#moveToCreateStep("new");
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
                this.#moveToCreateStep("copy");
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
                this.#moveToCreateStep("combine");
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
    const {
      classes,
      localObserver,
      newFeature,
      editTab,
      featureUpdateInProgress,
    } = this.props;

    const newFeatureExists = newFeature?.features?.length > 0;
    const okDisabled =
      editTab === "update" ? !featureUpdateInProgress : !newFeatureExists;

    const shouldShowSnappingControls = editMode === "new";
    const shouldShowUpdateControls = editMode !== "combine";

    const cancelButton =
      editTab === "update" ? (
        <Tooltip title="Ångra alla ändringar">
          <Button
            className={classes.stepButtonGroup}
            disabled={!featureUpdateInProgress}
            onClick={() => this.#handleResetUpdate(editMode)}
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
                disabled={okDisabled}
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
    const { classes, newFeature, editTab } = this.props;

    //Are we in update or create mode?
    const inUpdateTab = editTab === "update";
    const newFeatureExists = newFeature?.features?.length > 0;
    const updateButtonDisabled = inUpdateTab
      ? !this.state.updateFeatureActive
      : !newFeatureExists;

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
                disabled={updateButtonDisabled}
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
                disabled={updateButtonDisabled}
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
                disabled={updateButtonDisabled}
                value="delete"
                selected={this.state.chosenUpdateTool === "delete"}
                onChange={(e, newValue) => {
                  e.preventDefault();
                  this.#handleDeleteEdit(this.state.editMode);
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

  renderStepConfirmCreate = (editMode) => {
    const { classes, editTab } = this.props;

    const informationText = this.#getEditInfoText(editTab === "create");

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

  renderStepConfirmUpdate = (editMode) => {
    const { editTab } = this.props;
    const informationText = this.#getEditInfoText(editTab === "update");

    return (
      <Grid container item xs={12}>
        <Grid item xs={12}>
          <Typography paragraph>{informationText}</Typography>
        </Grid>
        <Grid item xs={12} style={{ marginTop: "16px" }}>
          <Box display="flex">
            <ButtonGroup>
              <Button
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
            {this.renderStepConfirmCreate(this.state.editMode)}
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
            {this.renderStepConfirmUpdate(this.state.editMode)}
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
    /*Handle changes related to the open/closed state of the Editing menu.*/
    if (prevProps.isEditMenuOpen !== this.props.isEditMenuOpen) {
      //When we open the edit menu, we decide which tab we should be in by default. If we have a selected item, we should default to the 'Ändra' tab.
      if (this.props.selectionExists) {
        this.props.handleChangeEditTab("update");
      }

      //If we are in the 'Ändra' tab when we open the menu, we want to jump into the first step.
      if (this.props.isEditMenuOpen && this.props.editTab === "update") {
        this.setState({ activeStepUpdate: 0 });
      }

      //When the edit panel gets closed, reset the edit menu.
      if (!this.props.isEditMenuOpen) {
        this.#resetEditMenu(true);
      }
    }

    /*Handle changes related to which edit menu Tab is selected*/
    if (prevProps.editTab !== this.props.editTab) {
      //If we enter the editTab, while the edit menu is open, we should go into the first (0th) step.
      if (this.props.editTab === "update" && this.props.isEditMenuOpen) {
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
    const { classes, layerMode } = this.props;
    const layerModeEditable =
      this.props.model.options.mapObjects[layerMode].editable;

    let editdisabled =
      this.props.isEditMenuOpen === false && !layerModeEditable;

    return (
      <Grid item container xs={12}>
        <Accordion
          disabled={editdisabled}
          component={editdisabled ? "div" : undefined}
          elevation={0}
          expanded={this.props.isEditMenuOpen}
          className={classes.accordion}
          onChange={(e, newValue) => {
            this.props.handleUpdateIsEditMenuOpen(newValue);
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
                  this.props.isEditMenuOpen ? <CloseIcon /> : <ExpandMore />
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
                    value={this.props.editTab}
                    variant="fullWidth"
                    indicatorColor="secondary"
                    textColor="primary"
                    onChange={(e, newValue) => {
                      this.props.handleChangeEditTab(newValue);
                    }}
                  >
                    <Tab
                      value="create"
                      label="Skapa nytt"
                      disabled={this.props.updateSessionInProgress}
                    ></Tab>
                    <Tab
                      value="update"
                      label="Ändra"
                      disabled={
                        !this.props.selectionExists ||
                        this.props.createSessionInProgress
                      }
                    ></Tab>
                  </Tabs>
                </Paper>
              </Grid>
              <Grid item xs={12} style={{ marginTop: "8px" }}>
                {this.renderStepper(this.props.editTab)}
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      </Grid>
    );
  }
}

export default withStyles(styles)(EditMenu);

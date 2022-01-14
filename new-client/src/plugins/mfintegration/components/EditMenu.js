import React from "react";
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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from "@material-ui/core";
import { ToggleButton, ToggleButtonGroup } from "@material-ui/lab";
import ExpandMore from "@material-ui/icons/ExpandMore";
import ChevronLeftIcon from "@material-ui/icons/ChevronLeft";
import OpenWithIcon from "@material-ui/icons/OpenWith";
import DeleteIcon from "@material-ui/icons/Delete";
import FormatShapesIcon from "@material-ui/icons/FormatShapes";
import CopyingControl from "./CopyingControl";
import SnappingControl from "./SnappingControl";
import { drawingSupportLayersArray } from "./../mockdata/mockdataLayers";

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
  activeStep: 0,
  editOpen: false,
  editTab: "create",
  editMode: "none", //new, copy, combine
  changeEditMode: null, //edit, move, delete
  drawActive: false,
  isNewEdit: false,
  selectCopyActive: false,
  selectCombineActive: false,
  activeCombineLayer: "",
};

class EditMenu extends React.PureComponent {
  state = {
    activeStep: 0,
    editOpen: false,
    editTab: "create",
    editMode: "none", //new, copy, combine
    changeEditMode: null, //edit, move, delete
    drawActive: false,
    isNewEdit: false,
    selectCopyActive: false,
    selectCombineActive: false,
    activeCombineLayer: "",
  };

  constructor(props) {
    super(props);

    this.localObserver = props.localObserver;

    this.#bindSubscriptions();
  }

  #bindSubscriptions = () => {
    this.localObserver.subscribe("mf-new-feature-pending", () => {
      const newValue = true;
      this.setState({ isNewEdit: newValue });
    });
    this.localObserver.subscribe("mf-edit-supportLayer", (layer) => {
      this.supportLayer = layer;
    });
  };

  #resetEditMenu = () => {
    this.setState({ ...defaultState });
  };

  #toggleEditOpen = () => {
    this.setState({ editOpen: !this.state.editOpen });
  };

  #handleChangeCombineLayer = (layerId) => {
    this.setState({ activeCombineLayer: layerId });
  };

  #getAvailableWfsLayers = () => {
    return drawingSupportLayersArray();
  };

  // renderStepTwoControls = () => {
  //   const { classes, handleUpdateEditToolsMode } = this.props;
  //   return (
  //     <ToggleButtonGroup
  //       style={{ width: "100%" }}
  //       exclusive
  //       value={this.state.changeEditMode}
  //       onChange={(e, newValue) => {
  //         e.preventDefault();
  //         if (!newValue) {
  //           handleUpdateEditToolsMode(
  //             this.state.changeEditMode,
  //             this.state.editMode
  //           );
  //           return;
  //         }
  //         this.setState({ changeEditMode: newValue }, () => {
  //           handleUpdateEditToolsMode(newValue, this.state.editMode);
  //         });
  //       }}
  //     >
  //       <TooltipToggleButton
  //         disabled={!this.state.isNewEdit}
  //         className={classes.stepButtonGroup}
  //         size="small"
  //         value="edit"
  //         title="Omforma befintlig redigering"
  //         aria-label="Omforma befintlig redigering"
  //       >
  //         <FormatShapesIcon size="small" />
  //         <Typography noWrap variant="button">
  //           &nbsp; Omforma
  //         </Typography>
  //       </TooltipToggleButton>
  //       <TooltipToggleButton
  //         disabled={!this.state.isNewEdit}
  //         className={classes.stepButtonGroup}
  //         size="small"
  //         value="move"
  //         title="Flytta befintlig redigering"
  //         aria-label="Flytta befintlig redigering"
  //       >
  //         <OpenWithIcon size="small" />
  //         <Typography noWrap variant="button">
  //           &nbsp; Flytta
  //         </Typography>
  //       </TooltipToggleButton>
  //       <TooltipToggleButton
  //         disabled={!this.state.isNewEdit}
  //         className={classes.stepButtonGroup}
  //         size="small"
  //         value="delete"
  //         title="Radera befintlig redigering"
  //         aria-label="Radera befintlig redigering"
  //       >
  //         <DeleteIcon size="small" />
  //         <Typography noWrap variant="button">
  //           &nbsp; Radera
  //         </Typography>
  //       </TooltipToggleButton>
  //     </ToggleButtonGroup>
  //   );
  // };

  renderStepOne = () => {
    const { classes, localObserver } = this.props;
    return (
      <Grid container item xs={12}>
        <ButtonGroup style={{ width: "100%" }}>
          <Tooltip title="Rita nytt objekt">
            <Button
              className={classes.stepButtonGroup}
              aria-label="Rita nytt objekt"
              onClick={() => {
                this.setState({
                  activeStep: 1,
                  editMode: "new",
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
              className={classes.stepButtonGroup}
              aria-label="Kopiera befintlig objekt"
              onClick={() => {
                this.setState({
                  activeStep: 1,
                  editMode: "copy",
                });
              }}
            >
              Kopiera
            </Button>
          </Tooltip>
          <Tooltip title="Kombinera befintliga objekt">
            <Button
              className={classes.stepButtonGroup}
              aria-label="Kombinera befintliga objekt"
              onClick={() => {
                this.setState({
                  activeStep: 1,
                  editMode: "combine",
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

  renderStepTwo = (editMode) => {
    const { classes, localObserver } = this.props;
    if (editMode === "new") {
      return (
        <Grid container item xs={12} spacing={(2, 2)}>
          <Grid item xs={12}>
            <Typography>Rita ut det nya objektet i kartan.</Typography>
          </Grid>
          <Grid item xs={12}>
            <SnappingControl
              enabled={true}
              availableSnapLayers={this.#getAvailableWfsLayers()}
              localObserver={localObserver}
            />
          </Grid>
          <Grid item xs={12}>
            {this.renderStepTwoControls()}
          </Grid>
          <Grid item xs={12}>
            <Box display="flex">
              <ButtonGroup style={{ width: "100%" }}>
                <Tooltip title="Tillbaka till föregående steg">
                  <Button
                    className={classes.stepButtonGroup}
                    startIcon={<ChevronLeftIcon />}
                    onClick={() => {
                      this.setState({ activeStep: 0 });
                      this.setState({ isNewEdit: false });
                      localObserver.publish("mf-end-draw-new-geometry", {
                        editMode: editMode,
                        saveGeometry: false,
                      });
                      localObserver.publish(
                        "mf-edit-noSupportLayer",
                        this.supportLayer
                      );
                    }}
                    aria-label="Tillbaka"
                  >
                    Bakåt
                  </Button>
                </Tooltip>
                <Button
                  className={classes.stepButtonGroup}
                  disabled={!this.state.isNewEdit}
                  onClick={() => {
                    this.setState({ activeStep: 2 });
                    this.setState({ isNewEdit: false });
                    localObserver.publish("mf-end-draw-new-geometry", {
                      editMode: editMode,
                      saveGeometry: true,
                    });
                    localObserver.publish(
                      "mf-edit-noSupportLayer",
                      this.supportLayer
                    );
                  }}
                  aria-label="OK"
                >
                  Ok
                </Button>
              </ButtonGroup>
            </Box>
          </Grid>
        </Grid>
      );
    }

    if (editMode === "copy") {
      return (
        <Grid container item xs={12} spacing={(2, 2)}>
          <CopyingControl
            availableCopyLayers={this.#getAvailableWfsLayers()}
            localObserver={localObserver}
          />
          <Grid item xs={12}>
            {this.renderStepTwoControls()}
          </Grid>
          <Grid item xs={12}>
            <Box display="flex">
              <ButtonGroup style={{ width: "100%" }}>
                <Tooltip title="Tillbaka till föregående steg">
                  <Button
                    className={classes.stepButtonGroup}
                    startIcon={<ChevronLeftIcon />}
                    onClick={() => {
                      this.setState({ activeStep: 0 });
                      this.setState({ isNewEdit: false });
                      localObserver.publish("mf-end-draw-new-geometry", {
                        editMode: editMode,
                        saveGeometry: false,
                      });
                      localObserver.publish(
                        "mf-edit-noSupportLayer",
                        this.supportLayer
                      );
                    }}
                    aria-label="Tillbaka"
                  >
                    Bakåt
                  </Button>
                </Tooltip>
                <Button
                  className={classes.stepButtonGroup}
                  onClick={() => {
                    this.setState({ activeStep: 2 });
                    this.setState({ isNewEdit: false });
                    localObserver.publish("mf-end-draw-new-geometry", {
                      editMode: editMode,
                      saveGeometry: true,
                    });
                  }}
                  aria-label="OK"
                >
                  Ok
                </Button>
              </ButtonGroup>
            </Box>
          </Grid>
        </Grid>
      );
    }

    if (editMode === "combine") {
      return (
        <Grid container item xs={12} spacing={(2, 2)}>
          <Grid item xs={12}>
            <Typography>
              Välj två angränsande objekt i kartan att kombinera till nytt
              objekt
            </Typography>
          </Grid>
          <Grid item xs={12}>
            <FormControl margin="none">
              <InputLabel disableAnimation>Från lager</InputLabel>
              <Select
                style={{ minWidth: 200 }}
                value={this.state.activeCombineLayer}
                onChange={(e) => this.#handleChangeCombineLayer(e.target.value)}
              >
                <MenuItem key={"1"} value={"1"}>
                  {"example layer"}
                </MenuItem>
                <MenuItem key={"2"} value={"2"}>
                  {"example layer 2"}
                </MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <TooltipToggleButton
              size="small"
              title="Välj objekt att slå ihop"
              aria-label="Välj objekt att slå ihop"
              selected={this.state.selectCombineActive}
              value={"selectCombineActive"}
              onChange={() => {
                this.setState({
                  selectCombineActive: !this.state.selectCombineActive,
                });
              }}
            >
              <Typography variant="button">&nbsp; Välj Objekt</Typography>
            </TooltipToggleButton>
            <Button
              variant="outlined"
              style={{ marginLeft: "8px" }}
              onClick={() => {
                console.log("kombinera");
              }}
            >
              Kombinera
            </Button>
          </Grid>
          <Grid item xs={12}>
            {this.renderStepTwoControls()}
          </Grid>
          <Grid item xs={12}>
            <Box display="flex">
              <ButtonGroup style={{ width: "100%" }}>
                <Tooltip title="Tillbaka till föregående steg">
                  <Button
                    className={classes.stepButtonGroup}
                    startIcon={<ChevronLeftIcon />}
                    onClick={() => {
                      this.setState({ activeStep: 0 });
                      this.setState({ isNewEdit: false });
                      localObserver.publish(
                        "mf-end-draw-new-geometry",
                        editMode
                      );
                      localObserver.publish(
                        "mf-edit-noSupportLayer",
                        this.supportLayer
                      );
                    }}
                    aria-label="Tillbaka"
                  >
                    Bakåt
                  </Button>
                </Tooltip>
                <Button
                  className={classes.stepButtonGroup}
                  onClick={() => {
                    this.setState({ activeStep: 2 });
                    this.setState({ isNewEdit: false });
                  }}
                  aria-label="OK"
                >
                  Ok
                </Button>
              </ButtonGroup>
            </Box>
          </Grid>
        </Grid>
      );
    }
  };

  renderStepTwoControls = () => {
    const { classes, handleUpdateEditToolsMode } = this.props;
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
                disabled={!this.state.isNewEdit}
                value="edit"
                onChange={(e, newValue) => {
                  e.preventDefault();
                  if (!newValue) {
                    handleUpdateEditToolsMode(
                      this.state.changeEditMode,
                      this.state.editMode
                    );
                    return;
                  }
                  this.setState({ changeEditMode: newValue }, () => {
                    handleUpdateEditToolsMode(newValue, this.state.editMode);
                  });
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
                disabled={!this.state.isNewEdit}
                value="move"
                onChange={(e, newValue) => {
                  e.preventDefault();
                  if (!newValue) {
                    handleUpdateEditToolsMode(
                      this.state.changeEditMode,
                      this.state.editMode
                    );
                    return;
                  }
                  this.setState({ changeEditMode: newValue }, () => {
                    handleUpdateEditToolsMode(newValue, this.state.editMode);
                  });
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
                disabled={!this.state.isNewEdit}
                value="delete"
                onChange={(e, newValue) => {
                  e.preventDefault();
                  if (!newValue) {
                    handleUpdateEditToolsMode(
                      this.state.changeEditMode,
                      this.state.editMode
                    );
                    return;
                  }
                  this.setState({ changeEditMode: newValue }, () => {
                    handleUpdateEditToolsMode(newValue, this.state.editMode);
                  });
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

  renderStepThree = () => {
    const informationText =
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam.";
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
                onClick={() => {
                  this.setState({ activeStep: 0 });
                }}
              >
                Skapa Fler
              </Button>
              <Button
                className={classes.stepButtonGroup}
                onClick={() => {
                  this.#resetEditMenu();
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

  render() {
    const { classes } = this.props;

    return (
      <Grid item container xs={12}>
        <Accordion
          elevation={0}
          expanded={this.state.editOpen}
          className={classes.accordion}
          onChange={() => {
            this.#toggleEditOpen();
          }}
        >
          <StyledAccordionSummary expandIcon={<ExpandMore />}>
            <Typography>Redigera</Typography>
          </StyledAccordionSummary>
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
                    <Tab value="create" label="Skapa nytt"></Tab>
                    <Tab value="update" label="Ändra" disabled></Tab>
                  </Tabs>
                </Paper>
              </Grid>
              <Grid item xs={12} style={{ marginTop: "8px" }}>
                <Stepper
                  activeStep={this.state.activeStep}
                  orientation="vertical"
                  className={classes.stepper}
                >
                  <Step key="selectMethod">
                    <StepLabel>Välj metod</StepLabel>
                    <StepContent>{this.renderStepOne()}</StepContent>
                  </Step>
                  <Step key="createObject">
                    <StepLabel>Skapa</StepLabel>
                    <StepContent>
                      {this.renderStepTwo(this.state.editMode)}
                    </StepContent>
                  </Step>
                  <Step key="confirm">
                    <StepLabel>Klart</StepLabel>
                    <StepContent>{this.renderStepThree()}</StepContent>
                  </Step>
                </Stepper>
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      </Grid>
    );
  }
}

export default withStyles(styles)(EditMenu);

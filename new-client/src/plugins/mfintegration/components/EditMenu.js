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
import EditIcon from "@material-ui/icons/Edit";
import OpenWithIcon from "@material-ui/icons/OpenWith";
import DeleteIcon from "@material-ui/icons/Delete";
import FileCopyOutlinedIcon from "@material-ui/icons/FileCopyOutlined";
import FormatShapesIcon from "@material-ui/icons/FormatShapes";
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
  editMode: "none", //draw, copy, combine
  changeEditMode: null, //edit, move, delete
  drawActive: false,
  isNewEdit: false,
  selectCopyActive: false,
  selectCombineActive: false,
  activeCopyLayer: "",
  activeCombineLayer: "",
};

class EditMenu extends React.PureComponent {
  state = {
    activeStep: 0,
    editOpen: false,
    editTab: "create",
    editMode: "none", //draw, copy, combine
    changeEditMode: null, //edit, move, delete
    drawActive: false,
    isNewEdit: false,
    selectCopyActive: false,
    selectCombineActive: false,
    activeCopyLayer: "",
    activeCombineLayer: "",
  };

  #resetEditMenu = () => {
    this.setState({ ...defaultState });
  };

  #toggleEditOpen = () => {
    this.setState({ editOpen: !this.state.editOpen });
  };

  #handleChangeCopyLayer = (layerId) => {
    this.setState({ activeCopyLayer: layerId });
  };

  #handleChangeCombineLayer = (layerId) => {
    this.setState({ activeCombineLayer: layerId });
  };

  renderStepTwoControls = () => {
    const { classes } = this.props;
    return (
      <ToggleButtonGroup
        style={{ width: "100%" }}
        exclusive
        value={this.state.changeEditMode}
        onChange={(e, newValue) => {
          this.setState({ changeEditMode: newValue });
        }}
      >
        <TooltipToggleButton
          disabled={!this.state.isNewEdit}
          className={classes.stepButtonGroup}
          size="small"
          value="edit"
          title="Omforma befintlig redigering"
          aria-label="Omforma befintlig redigering"
        >
          <FormatShapesIcon size="small" />
          <Typography noWrap variant="button">
            &nbsp; Omforma
          </Typography>
        </TooltipToggleButton>
        <TooltipToggleButton
          disabled={!this.state.isNewEdit}
          className={classes.stepButtonGroup}
          size="small"
          value="move"
          title="Flytta befintlig redigering"
          aria-label="Flytta befintlig redigering"
        >
          <OpenWithIcon size="small" />
          <Typography noWrap variant="button">
            &nbsp; Flytta
          </Typography>
        </TooltipToggleButton>
        <TooltipToggleButton
          disabled={!this.state.isNewEdit}
          className={classes.stepButtonGroup}
          size="small"
          value="delete"
          title="Radera befintlig redigering"
          aria-label="Radera befintlig redigering"
        >
          <DeleteIcon size="small" />
          <Typography noWrap variant="button">
            &nbsp; Radera
          </Typography>
        </TooltipToggleButton>
      </ToggleButtonGroup>
    );
  };

  renderStepOne = () => {
    const { classes } = this.props;
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
                  editMode: "draw",
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
    const { classes } = this.props;
    if (editMode === "draw") {
      return (
        <Grid container item xs={12} spacing={(2, 2)}>
          <Grid item xs={12}>
            <Typography>Rita ut det nya objektet i kartan.</Typography>
          </Grid>
          <Grid item xs={12}>
            <TooltipToggleButton
              size="small"
              title="Börja rita i kartan"
              aria-label="Börja rita i kartan"
              selected={this.state.drawActive}
              value={"drawActive"}
              onChange={() => {
                this.setState({ drawActive: !this.state.drawActive });
              }}
            >
              <EditIcon size="small" />
              <Typography variant="button">&nbsp; Rita</Typography>
            </TooltipToggleButton>
          </Grid>
          <Grid item xs={12}>
            <SnappingControl
              enabled={false}
              availableLayers={[
                { id: 1, name: "Fastigheter" },
                { id: 2, name: "Tillsynsobjekt" },
              ]}
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
          <Grid item xs={12}>
            <Typography>Välj ett objekt i kartan att kopiera från</Typography>
          </Grid>
          <Grid item xs={12}>
            <FormControl margin="none">
              <InputLabel disableAnimation>Från lager</InputLabel>
              <Select
                style={{ minWidth: 200 }}
                value={this.state.activeCopyLayer}
                onChange={(e) => this.#handleChangeCopyLayer(e.target.value)}
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
              title="Välj objekt för kopiering"
              aria-label="Välj objekt för kopiering"
              selected={this.state.selectCopyActive}
              value={"selectCopyActive"}
              onChange={() => {
                this.setState({
                  selectCopyActive: !this.state.selectCopyActive,
                });
              }}
            >
              <Typography variant="button">&nbsp; Välj Objekt</Typography>
            </TooltipToggleButton>
            <Button variant="outlined" style={{ marginLeft: "8px" }}>
              <FileCopyOutlinedIcon size="small" />
              Skapa kopia
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
                <Paper square elevation={0}>
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

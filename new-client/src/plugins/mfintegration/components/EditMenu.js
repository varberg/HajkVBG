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
} from "@material-ui/core";
import { ToggleButton, ToggleButtonGroup } from "@material-ui/lab";
import ExpandMore from "@material-ui/icons/ExpandMore";
import ChevronLeftIcon from "@material-ui/icons/ChevronLeft";
import EditIcon from "@material-ui/icons/Edit";
import OpenWithIcon from "@material-ui/icons/OpenWith";
import DeleteIcon from "@material-ui/icons/Delete";
import FormatShapesIcon from "@material-ui/icons/FormatShapes";

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

class EditMenu extends React.PureComponent {
  state = {
    activeStep: 0,
    editOpen: false,
    editTab: "create",
    editMode: "none",
    drawActive: false,
    isNewEdit: false,
    changeEditMode: null,
  };

  #toggleEditOpen = () => {
    this.setState({ editOpen: !this.state.editOpen });
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
          value="move"
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
          value="move"
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
            <Box
              display="flex"
              justifyContent="center"
              alignItems="center"
              style={{
                width: "100%",
                height: "70px",
                border: "1px solid black",
              }}
            >
              <Typography>Snapping component goes here</Typography>
            </Box>
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
        <Grid item xs={12}>
          <Typography>kopiera</Typography>
        </Grid>
      );
    }

    if (editMode === "combine") {
      return (
        <Grid item xs={12}>
          <Typography>kombinera</Typography>
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
                  console.log("Finsish Editing");
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

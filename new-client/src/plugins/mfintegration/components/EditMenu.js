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
} from "@material-ui/core";
import { ToggleButtonGroup, ToggleButton } from "@material-ui/lab";
import ExpandMore from "@material-ui/icons/ExpandMore";

const styles = (theme) => {
  return {
    accordionDetails: { paddingLeft: "0px" },
    stepper: { padding: "0px" },
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

class EditMenu extends React.PureComponent {
  state = {
    editOpen: false,
    editTab: "create",
    editMode: "none",
  };

  toggleEditOpen = () => {
    this.setState({ editOpen: !this.state.editOpen });
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
            this.toggleEditOpen();
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
                <Stepper className={classes.stepper} orientation="vertical">
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
                          <ToggleButton value="combine">Kombinera</ToggleButton>
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
      </Grid>
    );
  }
}

export default withStyles(styles)(EditMenu);

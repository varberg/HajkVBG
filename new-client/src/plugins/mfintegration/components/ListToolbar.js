import React from "react";
import PropTypes from "prop-types";
import { withStyles } from "@material-ui/core/styles";
import { FormLabel, Grid, Box, Tooltip } from "@material-ui/core";
import { ToggleButtonGroup, ToggleButton } from "@material-ui/lab";
import TouchAppIcon from "@material-ui/icons/TouchApp";
import Crop32Icon from "@material-ui/icons/Crop32";
import CancelOutlinedIcon from "@material-ui/icons/CancelOutlined";

const styles = (theme) => {
  return {
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

class ListToolbar extends React.PureComponent {
  static propTypes = {
    listToolsMode: PropTypes.string, //is allowed to be null.
    handleClearResults: PropTypes.func.isRequired,
    handleUpdateListToolsMode: PropTypes.func.isRequired,
    disabled: PropTypes.bool.isRequired,
  };

  render() {
    const {
      classes,
      listToolsMode,
      handleClearResults,
      handleUpdateListToolsMode,
      disabled,
    } = this.props;

    return (
      <Grid item xs={12} style={{ marginTop: "8px" }}>
        <FormLabel>Markera i kartan</FormLabel>
        <Box display="flex">
          <Box>
            <ToggleButtonGroup
              exclusive
              value={listToolsMode}
              onChange={(e, newValue) => {
                handleUpdateListToolsMode(newValue);
              }}
            >
              <TooltipToggleButton
                title="Markera/Avmarkera"
                value="pointselect"
                aria-label="Markera/AvmarkeraMarkera/Avmarkera"
                className={classes.toggleButton}
                disabled={disabled}
              >
                <TouchAppIcon />
              </TooltipToggleButton>
              <TooltipToggleButton
                title="Markera med polygon"
                value="polygonselect"
                aria-label="Markera med polygon"
                className={classes.toggleButton}
                disabled={disabled}
              >
                <Crop32Icon />
              </TooltipToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Box style={{ marginLeft: "32px" }}>
            <Tooltip
              title="Ta bort alla markeringarna"
              aria-label="Ta bort alla markeringarna"
            >
              <ToggleButton
                value="clear"
                onClick={(e) => {
                  e.preventDefault();
                  handleClearResults();
                }}
                className={classes.toggleButton}
                disabled={disabled}
              >
                <CancelOutlinedIcon />
              </ToggleButton>
            </Tooltip>
          </Box>
        </Box>
      </Grid>
    );
  }
}

export default withStyles(styles)(ListToolbar);

import React, { Component } from "react";
import PropTypes from "prop-types";
import { withStyles } from "@material-ui/core/styles";
import PanelHeader from "./PanelHeader";
import { Rnd } from "react-rnd";

const styles = theme => {
  return {
    window: {
      zIndex: 1199,
      position: "absolute",
      background: "white",
      boxShadow:
        "0px 1px 3px 0px rgba(0, 0, 0, 0.2), 0px 1px 1px 0px rgba(0, 0, 0, 0.14), 0px 2px 1px -1px rgba(0, 0, 0, 0.12)",
      borderRadius: "5px",
      overflow: "hidden",
      [theme.breakpoints.down("md")]: {
        position: "fixed !important",
        top: "0 !important",
        left: "0 !important",
        right: "0 !important",
        bottom: "0 !important",
        transform: "inherit !important",
        borderRadius: "0 !important",
        width: "unset !important",
        height: "unset !important"
      }
    },
    content: {
      position: "absolute",
      top: "46px",
      left: 0,
      right: 0,
      bottom: 0,
      overflowY: "auto",
      padding: "10px"
    }
  };
};

class Panel extends Component {
  close = e => {
    const { onClose } = this.props;
    if (onClose) onClose();
  };

  state = {};

  constructor(props) {
    super(props);
    window.addEventListener("resize", () => {
      if (this.props.left > 50) {
        this.rnd.updatePosition({ x: window.innerWidth - 410 });
      }
    });
  }

  render() {
    const { classes, title, children } = this.props;
    return (
      <Rnd
        ref={c => {
          this.rnd = c;
        }}
        style={{
          display: this.props.open ? "block" : "none"
        }}
        className={classes.window}
        minWidth={300}
        minHeight={400}
        bounds="window"
        default={{
          x: this.props.left || 8,
          y: this.props.top || 70,
          width: this.props.width || 400,
          height: this.props.height || 600
        }}
      >
        <PanelHeader onClose={this.close} title={title} />
        <div className={classes.content}>
          <div className={classes.drawerPaperContent}>{children}</div>
        </div>
      </Rnd>
    );
  }
}

Panel.propTypes = {
  classes: PropTypes.object.isRequired
};

export default withStyles(styles)(Panel);

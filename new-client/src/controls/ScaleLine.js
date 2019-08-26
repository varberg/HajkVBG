import React from "react";
import { withStyles } from "@material-ui/core/styles";
import { ScaleLine } from "ol/control";
import { Paper, Tooltip, Slider } from "@material-ui/core";
import { Select } from "@material-ui/core";

const styles = theme => {
  return {
    scaleLine: {
      "& .ol-scale-line": {
        right: "75px",
        bottom: "10px",
        background: theme.palette.background.paper,
        boxShadow: theme.shadows[4],
        border: "1px solid rgba(255 ,255, 255, 0.5)",
        borderRadius: "2px"
      },
      "& .ol-scale-line-inner": {
        cursor: "default",
        borderColor: theme.palette.text.primary,
        color: theme.palette.text.primary,
        fontSize: "0.7em",
        lineHeight: "1.5em"
      }
    },
    scaleBadge: {
      position: "absolute",
      right: "10px",
      bottom: "10px",
      padding: "5px",
      color: "rgba(0, 0, 0, 0.87)",
      fontSize: "0.7em",
      lineHeight: "1.5em",
      borderRadius: "2px",
      cursor: "default"
    }
  };
};

class ScaleLineControl extends React.PureComponent {
  state = {
    scale: 0,
    resolution: 0
  };

  /**
   * FIXME: Decide which mode/modes should be implemented.
   *
   * See below for modes and make sure to set one!
   *
   * ADDITIONAL COMMENTS ON WHY THIS IS ADDED
   * The thing with this branch is that I have some
   * unfinished improvements that were fun to code,
   * but need some though before we implement them completely.
   * So I have not styled the "select" and "slider" components.
   *
   * Each comes with their pros & cons:
   *  - text: static but displays values correctly, even when user
   *    is pinching/zooming between the sat resolutions.
   *  - select: in addition to display, user can also set a resolution
   *    from a pre-defined set. The drawback is though that we run
   *    into problems when user zooms to a resolution between two
   *    of the pre-defined scales: what should the selection show?
   *  - slider: takes up a lot more screen estate. Encourages user
   *    to free-zoom to any level, not only predefined. This might
   *    have performance implications as the WMS will probably be
   *    unable to use GWC (cache) in most situations. There is though
   *    one big plus with this solution: it both shows the exactly
   *    correct value and lets user set any value freely.
   */
  // Allowed modes: "text", "select", "slider"
  mode = "text";

  componentDidUpdate() {
    // Important condition, to ensure that we don't add new ScaleLine and Binds each time value changes
    if (this.props.map && this.refs.scaleLine.children.length === 0) {
      // Set initial value of scale
      this.setState({
        scale: this.formatScale(this.getScale()),
        resolution: this.props.map.getView().getResolution()
      });

      // Add ScaleLine
      const scaleLineControl = new ScaleLine({
        target: this.refs.scaleLine
      });
      this.props.map.addControl(scaleLineControl);

      // Add custom scale bar with numbers (e.g. 1:1000)
      // Bind change event to update current scale
      this.props.map.getView().on("change:resolution", () => {
        this.setState({
          scale: this.formatScale(this.getScale()),
          resolution: this.props.map.getView().getResolution()
        });
      });
    }
  }

  /**
   * Get current map scale
   * @instance
   * @return {number} map scale
   */
  getScale(res = this.props.map.getView().getResolution()) {
    const dpi = 25.4 / 0.28,
      mpu = this.props.map
        .getView()
        .getProjection()
        .getMetersPerUnit(),
      inchesPerMeter = 39.37;

    return res * mpu * inchesPerMeter * dpi;
  }

  /**
   * Format scale
   * @instance
   * @param {number} scale
   * @return {string} formatted
   */
  formatScale(scale) {
    return Math.round(scale)
      .toString()
      .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  // Event handler for change of <select>'s value
  changeResolution(e) {
    this.props.map.getView().setResolution(e.target.value);
  }

  renderScaleBadge() {
    const { classes, map } = this.props;
    let marks = [],
      min = 0,
      max = 1;

    map &&
      map
        .getView()
        .getResolutions()
        .forEach(r => {
          marks.push({
            value: r,
            label: "1:" + this.formatScale(this.getScale(r)) // TODO: make use of getScale and formatScale
          });
        });

    if (marks.length !== 0) {
      min = marks[0].value;
      max = marks[marks.length - 1].value;
    }

    // Local helper function that maps array to <option>s
    const mapOptions = function(m, i) {
      return (
        <option key={i} value={m.value}>
          {m.label}
        </option>
      );
    };

    if (this.mode === "slider") {
      return (
        <Slider
          defaultValue={this.state.resolution}
          marks={marks}
          valueLabelDisplay="on"
          min={max}
          max={min}
          step={1}
          valueLabelFormat={resolution => {
            return (
              this.props.map &&
              "1: " + this.formatScale(this.getScale(resolution))
            );
          }}
        />
      );
    }

    if (this.mode === "select") {
      return (
        <Select
          native
          variant="outlined"
          value={this.state.resolution}
          onChange={e => {
            this.changeResolution(e, this);
          }}
          inputProps={{
            name: "resolution",
            id: "resolutionSelect"
          }}
        >
          {marks.map(mapOptions)}
        </Select>
      );
    }

    if (this.mode === "text") {
      return (
        <Tooltip title="Nuvarande skala">
          <Paper elevation={4} className={classes.scaleBadge}>
            1:{this.state.scale}
          </Paper>
        </Tooltip>
      );
    }
  }

  render() {
    const { classes } = this.props;
    return (
      <>
        <div ref="scaleLine" className={classes.scaleLine} />
        {this.renderScaleBadge()}
      </>
    );
  }
}

export default withStyles(styles)(ScaleLineControl);

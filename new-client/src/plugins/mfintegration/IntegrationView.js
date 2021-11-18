import React from "react";
import PropTypes from "prop-types";
import { withSnackbar } from "notistack";
import { withStyles } from "@material-ui/core/styles";
import { Typography, Button } from "@material-ui/core";

const styles = (theme) => ({});
const defaultState = {};

const informationText =
  "Lorem, ipsum dolor sit amet consectetur adipisicing elit. Fugiat officiis quam incidunt cupiditate quisquam tempore minima cumque exercitationem omnis ratione!";

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
    this.bindSubscriptions();
  }

  bindSubscriptions = () => {
    this.localObserver.subscribe("window-opened", () => {
      console.log("IntegrationView - window-opened");
    });
  };

  render() {
    return (
      <>
        <Typography>{informationText}</Typography>
        <br />
        <Button
          onClick={() => {
            this.props.model.testEdpConnection();
          }}
          color="primary"
          variant="contained"
        >
          Test koppla EDP
        </Button>
        <Button
          onClick={() => {
            this.props.model.drawPolygon();
          }}
          color="primary"
          variant="contained"
        >
          Test rita polygon
        </Button>
        <Button
          onClick={() => {
            this.props.model.drawPoint();
          }}
          color="primary"
          variant="contained"
        >
          Test rita punkt
        </Button>
      </>
    );
  }
}

export default withStyles(styles)(withSnackbar(IntegrationView));

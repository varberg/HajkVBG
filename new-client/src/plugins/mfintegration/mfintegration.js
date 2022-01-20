import React from "react";
import PropTypes from "prop-types";
import BaseWindowPlugin from "../BaseWindowPlugin";
import Observer from "react-event-observer";
import RepeatIcon from "@material-ui/icons/Repeat";
import IntegrationModel from "./IntegrationModel";
import IntegrationView from "./IntegrationView";
import SearchModel from "./SearchModel";

const defaultOptions = {
  title: "EDP integration",
  panelDescription: "Integrera med EDP Vision",
  target: "control",
  position: "right",
  visibleAtStart: false,
  instruction:
    "Detta verktyg används för att hantera kartobjekt som har en koppling till EDP Vision.",
};

class MFIntegration extends React.PureComponent {
  state = {
    title: this.props.options.title ?? defaultOptions.title,
    description:
      this.props.options.panelDescription ?? defaultOptions.panelDescription,
    color: null,
  };

  static propTypes = {
    app: PropTypes.object.isRequired,
    map: PropTypes.object.isRequired,
    options: PropTypes.object.isRequired,
  };

  constructor(props) {
    super(props);
    this.localObserver = Observer();
    this.globalObserver = props.app.globalObserver;

    this.searchModel = new SearchModel({
      localObserver: this.localObserver,
      app: props.app,
      map: props.map,
    });

    this.model = new IntegrationModel({
      localObserver: this.localObserver,
      app: props.app,
      map: props.map,
      searchModel: this.searchModel,
      options: this.props.options,
    });
  }

  onWindowShow = () => {
    this.model.handleWindowOpen();
  };

  onWindowHide = () => {
    this.model.handleWindowClose();
  };

  render() {
    return (
      <BaseWindowPlugin
        {...this.props}
        type="mfintegration"
        custom={{
          icon: <RepeatIcon />,
          title: this.state.title,
          color: this.state.color,
          description: this.state.description,
          height: 800,
          width: 500,
          onWindowShow: this.onWindowShow,
          onWindowHide: this.onWindowHide,
        }}
      >
        <IntegrationView
          app={this.props.app}
          model={this.model}
          options={this.props.options}
          localObserver={this.localObserver}
          globalObserver={this.globalObserver}
          title={this.state.title}
        />
      </BaseWindowPlugin>
    );
  }
}

export default MFIntegration;

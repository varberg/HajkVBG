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
  listFeatureFillColor: "rgba(209,226,40,0.8)",
  listFeatureStrokeColor: "rgba(35,196,61,0.7)",
  selectedListFeatureFillColor: "rgba(189,16,224,1)",
  selectedListFeatureStrokeColor: "rgba(245,166,35,1)",
  unsavedFeatureFillColor: "rgba(139,87,42,1)",
  unsavedFeatureStrokeColor: "rgba(80,227,194,1)",
  editFeatureFillColor: "rgba(255,255,255,0.07)",
  editFeatureStrokeColor: "rgba(74,74,74,0.5)",
};

const mapStyles = "beans";

class MFIntegration extends React.PureComponent {
  state = {
    color: null,
    title: this.props.options.title ?? defaultOptions.title,
    description:
      this.props.options.panelDescription ?? defaultOptions.panelDescription,
  };

  static propTypes = {
    app: PropTypes.object.isRequired,
    map: PropTypes.object.isRequired,
    options: PropTypes.object.isRequired,
  };

  constructor(props) {
    console.log(props.options);
    console.log(mapStyles);
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

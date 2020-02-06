import React from "react";
import PropTypes from "prop-types";
import DocumentHandlerModel from "./DocumentHandlerModel";
import DocumentWindowBase from "./documentWindow/DocumentWindowBase";
import MenuOverlayView from "./documentsMenu/MenuOverlayView";
import Observer from "react-event-observer";

class DocumentHandler extends React.PureComponent {
  state = {};

  static propTypes = {
    app: PropTypes.object.isRequired,
    map: PropTypes.object.isRequired,
    options: PropTypes.object.isRequired
  };

  static defaultProps = {
    options: {}
  };

  constructor(props) {
    super(props);
    this.localObserver = Observer();

    this.localObserver.subscribe("documentHandlerEvent", message => {
      console.log(message);
    });

    this.documentHandlerModel = new DocumentHandlerModel({
      localObserver: this.localObserver,
      app: props.app,
      map: props.map
    });
  }

  render() {
    return (
      <>
        <MenuOverlayView
          model={this.DocumentHandlerModel}
          app={this.props.app}
          localObserver={this.localObserver}
        ></MenuOverlayView>
        <DocumentWindowBase
          {...this.props}
          model={this.DocumentHandlerModel}
          app={this.props.app}
          localObserver={this.localObserver}
        ></DocumentWindowBase>
      </>
    );
  }
}
export default DocumentHandler;

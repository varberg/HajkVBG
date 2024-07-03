import React from "react";

import BaseWindowPlugin from "../BaseWindowPlugin";

import FmeAppsView from "./FmeAppsView";
import FmeAppsIcon from "@mui/icons-material/Apps";
import Observer from "react-event-observer";

/**
 * FmeApps component
 *
 * @component
 * @example
 * <FmeApps {...props} />
 */

const FmeApps = (props) => {
  const localObserver = Observer();

  return (
    <BaseWindowPlugin
      {...props}
      type="FmeApps"
      custom={{
        icon: <FmeAppsIcon />,
        title: "FmeApps",
        height: "dynamic",
        width: 400,
        onWindowShow: () => {
          localObserver.publish("FMEApps:windowShow", {});
        },
        onWindowHide: () => {
          localObserver.publish("FMEApps:windowHide", {});
        },
      }}
    >
      <FmeAppsView
        options={props.options}
        globalObserver={props.app.globalObserver}
        localObserver={localObserver}
      />
    </BaseWindowPlugin>
  );
};

export default FmeApps;

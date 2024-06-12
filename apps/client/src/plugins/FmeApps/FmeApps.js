import React from "react";

import BaseWindowPlugin from "../BaseWindowPlugin";

import FmeAppsView from "./FmeAppsView";
import FmeAppsIcon from "@mui/icons-material/Apps";

/**
 * FmeApps component
 *
 * @component
 * @example
 * <FmeApps {...props} />
 */

const FmeApps = (props) => {
  return (
    <BaseWindowPlugin
      {...props}
      type="FmeApps"
      custom={{
        icon: <FmeAppsIcon />,
        title: "FmeApps",
        height: 450,
        width: 400,
        onWindowShow: () => {
          // console.log("onWindowShow");
        },
      }}
    >
      <FmeAppsView
        options={props.options}
        FmeApps={FmeApps}
        globalObserver={props.app.globalObserver}
      />
    </BaseWindowPlugin>
  );
};

export default FmeApps;

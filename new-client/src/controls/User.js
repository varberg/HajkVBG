import React, { useEffect, useState } from "react";

import { Avatar, Button, Paper, Tooltip } from "@material-ui/core";
import { makeStyles } from "@material-ui/styles";

import LocalStorageHelper from "utils/LocalStorageHelper";

const useStyles = makeStyles((theme) => ({
  paper: {
    marginBottom: theme.spacing(1),
  },
  button: {
    minWidth: "unset",
  },
  avatar: {
    width: 25,
    height: 25,
    fontSize: "0.8rem",
    backgroundColor: theme.palette.text.primary,
  },
}));

/**
 * @summary Transform a full name to initials, e.g. "John Smith" to "JS"
 *
 * @param {string} displayName
 * @returns {string} The initials from supplied string
 */
const getInitialsFromDisplayName = (displayName) => {
  return displayName
    .split(" ")
    .map((name) => name[0])
    .join("")
    .toUpperCase();
};

/**
 * @summary Compose a tooltip string by joining some user detail values
 *
 * @param {object} userDetails
 * @returns {string} Tooltip string value
 */
const getTooltipString = (userDetails) => {
  // Let's combine the details to an array
  const userDetailsArrays = [userDetails.displayName, userDetails.description];
  // Then we'll get rid of empty values, and create a string by joining the non-empty
  // values.
  return userDetailsArrays.filter((v) => v !== undefined).join(", ");
};

const TooltipListElement = ({ key, value }, index) => {
  return (
    <React.Fragment key={index}>
      <b>{key}:</b> {value}
      <br />
    </React.Fragment>
  );
};

const parseStoreDetails = (store, userDetails) => {
  const elements = [];

  // 'store' will contain all options, not only map-specific.
  // We must therefore distinguish those two in the first step.
  // Let's try to grab the map-specific options. If we succeed,
  // save some of the interesting settings to the elements array.
  try {
    const currentMapOptions = JSON.parse(store.store[store.currentMap]);

    elements.push({
      name: "searchInVisibleLayers",
      key: "Sök endast i synliga lager",
      value: currentMapOptions.searchOptions.searchInVisibleLayers
        ? "Aktiv"
        : "Inakitv",
    });
    elements.push({
      name: "enableLabelOnHighlight",
      key: "Visa textetiketter i kartan",
      value: currentMapOptions.searchOptions.enableLabelOnHighlight
        ? "Aktiv"
        : "Inakitv",
    });
  } catch (error) {}

  // Now continue grabbing stuff from the store and put into the elements array
  store.store.userPreferredColorScheme &&
    elements.push({
      name: "userPreferredColorScheme",
      key: "Färgschema",
      value:
        store.store.userPreferredColorScheme === "light" ? "Ljust" : "Mörkt",
    });

  return (
    <>
      <p>
        <b>{getTooltipString(userDetails)}</b>
      </p>
      <p>{elements.map(TooltipListElement)}</p>
    </>
  );
};

/**
 * @summary A button that contains user's initials inside an Avatar component
 *
 * @param {object} props
 * @returns {object} React
 */
const User = React.memo(({ userDetails }) => {
  const classes = useStyles();
  const [store, setStore] = useState(LocalStorageHelper.getReallyAll());

  useEffect(() => {
    document.addEventListener(
      "localStorageChanged",
      localStorageSetHandler,
      false
    );
  }, []);

  const localStorageSetHandler = function () {
    setStore(LocalStorageHelper.getReallyAll());
  };

  return (
    (userDetails && (
      <Tooltip title={parseStoreDetails(store, userDetails)}>
        <Paper className={classes.paper}>
          <Button
            aria-label={userDetails.displayName}
            className={classes.button}
          >
            <Avatar alt={userDetails.displayName} className={classes.avatar}>
              {getInitialsFromDisplayName(userDetails.displayName)}
            </Avatar>
          </Button>
        </Paper>
      </Tooltip>
    )) ||
    null
  );
});

export default User;

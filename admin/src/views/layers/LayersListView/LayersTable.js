import React from "react";
import { makeStyles, Typography } from "@material-ui/core";
import { DataGrid } from "@material-ui/data-grid";

import ConfigContext from "src/utils/ConfigContext";

const useStyles = makeStyles((theme) => ({
  root: {
    height: 480,
    width: "100%",
    marginBottom: theme.spacing(8),
    background: theme.palette.background.paper,
  },
}));

const LayersTable = (collection) => {
  const classes = useStyles();
  const config = React.useContext(ConfigContext);

  /**
   * @description Determine whether column should be visible or hidden by default
   * @param {string} k Name of column to be investigated
   * @returns {boolean}
   */
  const columnHiddenByDefault = (k) =>
    !["caption", "id", "imageFormat", "visibleAtStart"].includes(k);

  /**
   * @description Determine column type by looking at column name
   * @param {string} k Name of column to be investigated
   * @returns {string} Type of current column
   */
  const columnType = (k) => {
    // Must be one of the following:
    // 'string' | 'number' | 'date' | 'dateTime';
    switch (k) {
      case "id":
      case "opacity":
      case "zIndex":
        return "number";
      case "date":
        return "dateTime";
      default:
        return "string";
    }
  };

  /**
   * @description Determine column width by looking at column name
   * @param {string} k Name of column to be investigated
   * @returns {number} The value to be used as 'flex' parameter in DataGrid
   */
  const columnFlex = (k) => {
    // Must be one of the following:
    // 'string' | 'number' | 'date' | 'dateTime';
    switch (k) {
      case "content":
      case "caption":
        return 2;
      case "id":
        return 0;
      default:
        return 1;
    }
  };

  const handleDefault = (a) => {
    // Object.entries(a).map(console.log);
  };

  const handleRowSelected = (e) => {
    let arr = e.api.current.getSelectedRows().map((r) => r.caption);
    arr.push(e.data.caption);
    config.setMaps(arr);
  };

  return (
    collection.layers?.length > 0 && (
      <>
        <Typography>{collection.type}</Typography>
        <div className={classes.root}>
          <DataGrid
            checkboxSelection={handleDefault}
            onCellClick={handleDefault}
            onColumnHeaderClick={handleDefault}
            onCellHover={handleDefault}
            onError={handleDefault}
            onFilterModelChange={handleDefault}
            onPageChange={handleDefault}
            onPageSizeChange={handleDefault}
            onRowClick={handleDefault}
            onRowHover={handleDefault}
            onRowSelected={handleRowSelected}
            onSelectionModelChange={handleDefault}
            onSortModelChange={handleDefault}
            onStateChange={handleDefault}
            pageSize={7}
            columns={Object.keys(collection.layers[0]).map((k) => {
              return {
                field: k,
                headerName: k,
                hide: columnHiddenByDefault(k),
                flex: columnFlex(k),
                type: columnType(k),
              };
            })}
            rows={collection.layers}
          />
        </div>
      </>
    )
  );
};

export default LayersTable;

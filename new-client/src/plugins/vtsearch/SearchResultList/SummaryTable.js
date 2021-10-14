import React from "react";
import Paper from "@mui/material/Paper";
import VirtualizedTable from "./VirtualizedTable";

/**
 * @summary Table used to show summary for journeys
 * @description Table used to show a summary when the user search
 * for the type Journeys
 * @class SummaryTable
 * @extends {React.Component}
 */
class SummaryTable extends React.Component {
  state = {
    rows: this.props.rows,
  };

  render = () => {
    const { rowHeight, columns, height } = this.props;

    return (
      <Paper sx={{ height: `${height}px`, boxShadow: "none" }}>
        <VirtualizedTable
          rowCount={this.state.rows.length}
          rowHeight={rowHeight}
          rowGetter={({ index }) => this.state.rows[index]}
          columns={columns}
          sortable={false}
        />
      </Paper>
    );
  };
}

export default SummaryTable;

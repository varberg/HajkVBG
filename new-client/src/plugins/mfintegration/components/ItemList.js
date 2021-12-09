import React from "react";
import PropTypes from "prop-types";
import { withStyles, Typography, IconButton } from "@material-ui/core";
import VisibilityIcon from "@material-ui/icons/Visibility";
import VisibilityOffIcon from "@material-ui/icons/VisibilityOff";
import CancelOutlinedIcon from "@material-ui/icons/CancelOutlined";
import InfoIcon from "@material-ui/icons/Info";
import EditIcon from "@material-ui/icons/Edit";

const styles = (theme) => ({
  listItemContainer: {
    paddingLeft: "0",
    paddingTop: "5px",
    paddingBottom: "5px",
    borderBottom: `${theme.spacing(0.2)}px solid ${theme.palette.divider}`,
  },
  listItem: {
    display: "flex",
    justifyContent: "space-between",
    padding: "5px",
  },
  listItemText: {
    display: "flex",
    alignItems: "center",
    maxWidth: "70%",
  },
  itemButtons: {
    display: "flex",
    alignItems: "center",
    marginLeft: theme.spacing(1),
  },
  itemButton: {
    padding: theme.spacing(0.3),
  },
});

//override the standard MUI <IconButton> element style so we can customize the padding/margin.
const StyledIconButton = withStyles({
  root: {
    padding: 0,
    marginLeft: 0,
  },
})(IconButton);

class ItemList extends React.PureComponent {
  state = {
    infoVisible: false,
  };

  static propTypes = {
    item: PropTypes.object.isRequired,
    handleClickItem: PropTypes.func.isRequired,
    handleRemoveItem: PropTypes.func.isRequired,
  };

  toggleInfo = () => {
    this.setState({
      infoVisible: !this.state.infoVisible,
    });
  };

  editItem = () => {
    console.log("editItem");
  };

  renderInfo = (item) => {
    if (this.state.infoVisible) {
      return (
        <div>
          <Typography>{item.information}</Typography>
        </div>
      );
    } else return null;
  };

  render() {
    const {
      classes,
      item,
      listMode,
      handleClickItem,
      handleRemoveItem,
      handleToggleItemVisibilty,
    } = this.props;
    return (
      <div className={classes.itemList}>
        <div key={item.id} className={classes.listItemContainer}>
          <div className={classes.listItem}>
            <div
              id="itemText"
              className={classes.listItemText}
              onClick={(e) => handleClickItem(item)}
            >
              <Typography noWrap>{item.name}</Typography>
            </div>
            <div className={classes.itemButtons}>
              <div className={classes.itemButton}>
                <StyledIconButton
                  onClick={() => {
                    this.toggleInfo();
                  }}
                  aria-label="visa information"
                >
                  <InfoIcon />
                </StyledIconButton>
              </div>
              <div className={classes.itemButton}>
                <StyledIconButton
                  onClick={() => {
                    handleToggleItemVisibilty(item, listMode);
                  }}
                  aria-label="växla synlighet"
                >
                  {item.visible ? <VisibilityIcon /> : <VisibilityOffIcon />}
                </StyledIconButton>
              </div>
              <div className={classes.itemButton}>
                <StyledIconButton
                  onClick={(e) => {
                    handleRemoveItem(item, listMode);
                  }}
                  aria-label="välj bort"
                >
                  <CancelOutlinedIcon />
                </StyledIconButton>
              </div>
              <div className={classes.itemButton}>
                <StyledIconButton
                  onClick={() => {
                    this.editItem();
                  }}
                  aria-label="redigera"
                  disabled={listMode === "realEstate"}
                >
                  <EditIcon />
                </StyledIconButton>
              </div>
            </div>
          </div>
          {this.renderInfo(item)}
        </div>
      </div>
    );
  }
}

export default withStyles(styles)(ItemList);

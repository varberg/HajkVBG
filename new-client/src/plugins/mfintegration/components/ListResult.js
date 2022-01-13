import React from "react";
import PropTypes from "prop-types";
import { withStyles, Typography, IconButton, Tooltip } from "@material-ui/core";
import VisibilityIcon from "@material-ui/icons/Visibility";
import VisibilityOffIcon from "@material-ui/icons/VisibilityOff";
import CancelOutlinedIcon from "@material-ui/icons/CancelOutlined";
import DeleteIcon from "@material-ui/icons/Delete";
import InfoIcon from "@material-ui/icons/Info";
import StarBorderIcon from "@material-ui/icons/StarBorder";
import clsx from "clsx";

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
  itemSelected: { backgroundColor: "#fc9" },
  itemUnselected: { backgroundColor: "#fff" },
  infoDescription: { fontWeight: "bold", fontSize: "0.85rem" },
  infoText: { fontSize: "0.9rem" },
});

//override the standard MUI <IconButton> element style so we can customize the padding/margin.
const StyledIconButton = withStyles({
  root: {
    padding: 0,
    marginLeft: 0,
  },
})(IconButton);

class ListResult extends React.PureComponent {
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

  renderInfo = (item) => {
    const { classes } = this.props;
    if (this.state.infoVisible) {
      return (
        <>
          {item.information.map((property, index) => (
            <React.Fragment key={index}>
              <div style={{ cursor: "default" }}>
                <Typography className={classes.infoDescription}>
                  {property.description}
                </Typography>
                <Typography className={classes.infoText}>
                  {property.value}
                </Typography>
              </div>
            </React.Fragment>
          ))}
        </>
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
      handleRemoveCreatedItem,
      handleToggleItemVisibilty,
    } = this.props;
    return (
      <div className={classes.itemList}>
        <div
          key={item.id}
          className={
            item.selected
              ? clsx(classes.listItemContainer, classes.itemSelected)
              : clsx(classes.listItemContainer, classes.itemUnselected)
          }
        >
          <div className={classes.listItem}>
            <div
              id="itemText"
              className={classes.listItemText}
              onClick={(e) => handleClickItem(item, listMode)}
            >
              {item.isNew && <StarBorderIcon />}
              <Typography noWrap>{item.name}</Typography>
            </div>
            <div className={classes.itemButtons}>
              <div className={classes.itemButton}>
                <Tooltip title="Information om objektet">
                  <StyledIconButton
                    onClick={() => {
                      this.toggleInfo();
                    }}
                    aria-label="visa information"
                  >
                    <InfoIcon />
                  </StyledIconButton>
                </Tooltip>
              </div>
              <div className={classes.itemButton}>
                <Tooltip title="Visa/dölj objekt i kartan">
                  <StyledIconButton
                    onClick={() => {
                      handleToggleItemVisibilty(item, listMode);
                    }}
                    aria-label="växla synlighet"
                  >
                    {item.visible ? <VisibilityIcon /> : <VisibilityOffIcon />}
                  </StyledIconButton>
                </Tooltip>
              </div>
              {/* If the item is a newly created item (that is still temporary), it uses a different delete method. */}
              <div className={classes.itemButton}>
                {item.isNew ? (
                  <Tooltip title="Ta bort markering">
                    <StyledIconButton
                      onClick={(e) => {
                        handleRemoveCreatedItem(item, listMode);
                      }}
                      aria-label="välj bort"
                    >
                      <DeleteIcon />
                    </StyledIconButton>
                  </Tooltip>
                ) : (
                  <Tooltip title="Ta bort markering">
                    <StyledIconButton
                      onClick={(e) => {
                        handleRemoveItem(item, listMode);
                      }}
                      aria-label="välj bort"
                    >
                      <CancelOutlinedIcon />
                    </StyledIconButton>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
          {this.renderInfo(item)}
        </div>
      </div>
    );
  }
}

export default withStyles(styles)(ListResult);

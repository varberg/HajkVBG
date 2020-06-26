import React from "react";
import PropTypes from "prop-types";
import { withStyles } from "@material-ui/core/styles";
// import LayerGroup from "./LayerGroup.js";
import { TextField } from "@material-ui/core";
import { TreeView, TreeItem } from "@material-ui/lab";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";
import ChevronRightIcon from "@material-ui/icons/ChevronRight";
import CheckBoxIcon from "@material-ui/icons/CheckBox";
import CheckBoxOutlineBlankIcon from "@material-ui/icons/CheckBoxOutlineBlank";
// import IndeterminateCheckBoxIcon from "@material-ui/icons/IndeterminateCheckBox";

const styles = theme => ({
  iconContainer: {
    width: "auto"
  },
  group: {
    marginLeft: 32
  },
  treeItemRoot: {
    marginLeft: -18
  },
  treeViewRoot: {
    marginLeft: 20
  }
});

class LayersView extends React.PureComponent {
  static defaultProps = {};

  static propTypes = {
    app: PropTypes.object.isRequired,
    classes: PropTypes.object.isRequired,
    display: PropTypes.bool.isRequired,
    groups: PropTypes.array.isRequired,
    model: PropTypes.object.isRequired
  };

  defaultExpanded = [];
  defaultSelected = [];
  treeData = null;

  constructor(props) {
    super(props);

    // Clean up the groups prop so we obtain a nice tree that can be used in our TreeView

    this.treeData = this.fixIncomingData(props.groups);
    console.log("this.treeData: ", this.treeData);

    // When groups/layers tree is filtered, we expand all nodes.
    // This property is used to store the "old" expansion state,
    // so it can be restored when filtering is done.
    this.savedExpanded = null;

    this.state = {
      chapters: [],
      groups: props.groups,
      layersFilterValue: "",
      filteredTreeData: this.treeData,
      expanded: this.defaultExpanded,
      selected: this.defaultSelected
    };

    // Let all layers subscribe to visibility changed event (fired from App.js).
    // We do it to ensure that our checkboxes are updated whether layer visibility is changed
    // in some other way than by clicking on a layer in LayerSwitcher.
    props.app.globalObserver.subscribe("core.layerVisibilityChanged", e => {
      // See what's currently visible
      const visibleLayers = this.props.model.getVisibleLayers();
      // console.table(visibleLayers.map(l => l));

      /**
       * Just a demo of how to get URLs for legend grahpic. We should
       * do something like this in the upcoming Legend Graphic in Drawer
       * Component.
       */
      // Prepare Array of URLs to get legend graphic
      const urls = [];
      visibleLayers
        .map(layer => layer.get("layerInfo"))
        .map(layerInfo => layerInfo.legend)
        .map(legend => {
          return legend.map(subLayer => {
            return urls.push(subLayer.url);
          });
        });

      console.log("Legend graphic URLs: ", urls);

      // When layer's visibility is changed, ensure that correct checkboxes are ticked.
      const layerId = e.target.get("name");
      this.toggleCheckboxForLayer(layerId);
    });

    // If Informative is loaded, inject the "chapters" so we can take care of rendering "go-to chapter" buttons next to layer's name.
    props.app.globalObserver.subscribe("informativeLoaded", chapters => {
      if (Array.isArray(chapters)) {
        this.setState({
          chapters: chapters
        });
      }
    });
  }
  /**
   * @summary Re-format the incoming layers object to fit the TreeView/TreeItem model.
   *
   * @param {*} groups
   * @returns {Object[]} Groups of groups and layers
   */
  fixIncomingData = groups => {
    const iterateLayers = layers => {
      return layers.map(l => {
        const mapLayer = this.props.model.layerMap[Number(l.id)];
        let children = null;
        // Handle Hajk layer groups (NB, not the same as OGC/GeoServer Layer Groups!).
        // Hajk layer groups can never contain more layer groups, so no recursion is needed here.
        if (mapLayer.layerType === "group") {
          children = Object.values(mapLayer.layersInfo).map(sl => {
            return { id: sl.id, title: sl.caption };
          });
        }

        // If config says layer should be visible at start, put it into our state
        l.visibleAtStart === true && this.defaultSelected.push(l.id);

        return {
          id: l.id,
          title: mapLayer.get("caption"),
          ...(children && { children }), // nice way to add property only if it exists
          type: children ? "hajkGroup" : "layer"
        };
      });
    };

    const iterateGroups = groups => {
      return groups.map(g => {
        // If config says that current group should be expanded at start, put it into our state
        g.expanded === true && this.defaultExpanded.push(g.id);

        return {
          id: g.id,
          title: g.name,
          children: [...iterateGroups(g.groups), ...iterateLayers(g.layers)],
          type: "group"
        };
      });
    };

    return iterateGroups(groups);
  };

  toggleCheckboxForLayer(layerId) {
    // this.state.selected is an array that holds ids of visible layers.
    // By updating the array, we ensure that React checks the correct checkboxes.
    this.setState(state => {
      const selected = this.toggleArrayValue(state.selected, layerId);
      return { selected };
    });
  }

  toggleExpandedForId(id) {
    // this.state.selected is an array that holds ids of visible layers.
    // By updating the array, we ensure that React checks the correct checkboxes.
    this.setState(state => {
      const expanded = this.toggleArrayValue(state.expanded, id);
      return { expanded };
    });
  }

  copy(o) {
    return Object.assign({}, o);
  }

  toggleArrayValue(arrayList, arrayValue) {
    return arrayList.includes(arrayValue)
      ? arrayList.filter(el => el !== arrayValue)
      : [...arrayList, arrayValue];
  }

  filterLayers = o => {
    // GOOD STARTING POINT: https://stackoverflow.com/questions/38132146/recursively-filter-array-of-objects
    const { layersFilterValue } = this.state;
    // Check top level, if match, return, including all children
    if (
      o.title &&
      o.title.toLowerCase().includes(layersFilterValue.toLowerCase())
    )
      return true;

    // Else, let's run this recursively on children
    if (o.children) {
      return (o.children = o.children.map(this.copy).filter(this.filterLayers))
        .length;
    }
  };

  /**
   * @summary Grabs all ids from the groups/layers tree. Useful
   * if something needs to be done to all nodes.
   * @returns nodeIds[]
   * @memberof LayersView
   */
  grabAllIdsFromTree = (tree = this.treeData) => {
    const getIds = array => {
      return array.reduce((r, o) => {
        if ("id" in o) {
          r.push(o.id);
        }
        Object.values(o).forEach(v => {
          if (Array.isArray(v)) r.push(...getIds(v));
        });
        return r;
      }, []);
    };

    return getIds(tree);
  };

  handleChangeInLayersFilter = e => {
    // We want to expand all nodes before we filter.
    // However, in order to restore the expanded state
    // to the one prior this expansion, we must first
    // store the current state in a safe place.
    if (this.savedExpanded === null) {
      this.savedExpanded = this.state.expanded;
      this.setState({ expanded: this.grabAllIdsFromTree() });
    }

    const layersFilterValue = e.target.value;
    this.setState({ layersFilterValue }, () => {
      if (layersFilterValue.length === 0) {
        let newState = {};

        // Special case if empty string, reset to full tree data obtained in constructor()
        newState["filteredTreeData"] = this.treeData;

        // Also, reset the expanded state to how it was previously
        console.log("Resetting Expanded to defaults");
        newState["expanded"] = this.savedExpanded;

        this.setState(newState);
      } else {
        const filteredTreeData = this.treeData
          .map(this.copy)
          .filter(this.filterLayers);
        this.setState({ filteredTreeData });
      }
    });
  };

  handleClickOnToggle = (e, nodeId) => {
    console.log("handleClickOnToggle: ", nodeId);
    this.toggleExpandedForId(nodeId);
  };

  handleClickOnCheckbox = (event, nodeId) => {
    console.log("handleClickOnCheckbox: ", nodeId);
    const layerId = Number(nodeId);

    // Handle click on Hajk groups - they will have an MD5 as ID, so we can filter them out that way.
    if (Number.isNaN(layerId)) return;

    // Else, we've got a real layer/layergroup with valid ID. Let's add/remove it from our selected state array.
    const mapLayer = this.props.model.layerMap[layerId];
    console.log("Flipping visibility for mapLayer", mapLayer);
    mapLayer.setVisible(!this.isLayerVisible(nodeId));
  };

  renderTree = nodes => {
    // console.log("nodes: ", nodes);
    const { classes } = this.props;
    const hasChildren = Array.isArray(nodes.children);

    const checkboxIcon = this.isLayerVisible(nodes.id) ? (
      <CheckBoxIcon
        onClick={e => {
          this.handleClickOnCheckbox(e, nodes.id);
        }}
      />
    ) : (
      <CheckBoxOutlineBlankIcon
        onClick={e => {
          this.handleClickOnCheckbox(e, nodes.id);
        }}
      />
    );

    const collapseIcon = hasChildren ? (
      <>
        <ExpandMoreIcon
          onClick={e => {
            this.handleClickOnToggle(e, nodes.id);
          }}
        />
        {checkboxIcon}
      </>
    ) : (
      checkboxIcon
    );
    const expandIcon = hasChildren ? (
      <>
        <ChevronRightIcon
          onClick={e => {
            this.handleClickOnToggle(e, nodes.id);
          }}
        />
        {checkboxIcon}
      </>
    ) : (
      checkboxIcon
    );

    const label = (
      <div
        onClick={e => {
          this.handleClickOnCheckbox(e, nodes.id);
        }}
      >
        {nodes.title}
      </div>
    );

    return (
      <TreeItem
        key={nodes.id}
        nodeId={nodes.id}
        label={label}
        // icon={selectedIcon}
        // endIcon={selectedIcon}
        collapseIcon={collapseIcon}
        expandIcon={expandIcon}
        // onIconClick={(e, v) => {
        //   console.log("onIconClick", e, v);
        // }}
        // onLabelClick={(e, v) => {
        //   console.log("onLabelClick", e, v);
        // }}
        classes={{
          iconContainer: classes.iconContainer,
          group: classes.group,
          // If item has children, it will have a collapse/expand button. In that case, we need
          // justify a bit to compensate for the margin, so that all checkboxes will line up nicely.
          root: hasChildren ? classes.treeItemRoot : false
        }}
      >
        <>
          {Array.isArray(nodes.children)
            ? nodes.children.map(node => this.renderTree(node))
            : null}
        </>
      </TreeItem>
    );
  };

  isLayerVisible = nodeId => {
    return this.state.selected.includes(nodeId);
  };

  render() {
    const { layersFilterValue, filteredTreeData } = this.state;
    const { classes } = this.props;

    return (
      <div
        style={{
          display: this.props.display ? "block" : "none" // This is a View in the Tabs component
        }}
      >
        <TextField
          id="layers-filter"
          label="Filtrera lager"
          onChange={this.handleChangeInLayersFilter}
          value={layersFilterValue}
          variant="outlined"
          fullWidth
        />
        <TreeView
          expanded={this.state.expanded}
          selected={this.state.selected}
          multiSelect={false} // We will take care of the select state ourselves, user will of course be allowed to have multiple selected layers at once
          // onNodeToggle={(e, nids) => {
          //   console.log("onNodeToggle", e, nids);
          // }}
          // onNodeSelect={this.onNodeSelect}
          className={classes.treeViewRoot}
        >
          {filteredTreeData.map(this.renderTree)}
        </TreeView>
      </div>
    );
  }
}

export default withStyles(styles)(LayersView);

// Generic imports – all plugins need these
import React from "react";
import PropTypes from "prop-types";

// Plugin-specific imports. Most plugins will need a Model, View and Observer
// but make sure to only create and import whatever you need.
import SearchModel from "./SearchModel";
import Journeys from "./SearchViews/Journeys";
import Stops from "./SearchViews/Stops";
import Lines from "./SearchViews/Lines";
import Observer from "react-event-observer";
import { Tooltip } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import IconButton from "@mui/material/IconButton";
import MenuIcon from "@mui/icons-material/Menu";
import { styled } from "@mui/material/styles";
import FormControl from "@mui/material/FormControl";
import LinearProgress from "@mui/material/LinearProgress";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import SearchResultListContainer from "./SearchResultList/SearchResultListContainer";
import ReactDOM from "react-dom";
import MapViewModel from "./MapViewModel";

import BaseWindowPlugin from "../BaseWindowPlugin";
import SearchIcon from "@mui/icons-material/Search";

import Search from "./../../components/Search/Search";

const StyledFormControl = styled(FormControl)(({ theme }) => ({
  margin: theme.spacing(1),
  marginLeft: "0px",
  marginBottom: "24px",
  width: "100%",
  minWidth: 200,
}));

const LoaderContainer = styled("div")(() => ({
  flexBasis: "100%",
  minHeight: "5px",
  marginTop: "10px",
}));

const searchTypes = {
  DEFAULT: "",
  SEARCH: "Sök",
  JOURNEYS: "Sök Turer",
  LINES: "Sök Linjer",
  STOPS: "Sök Hållplatser",
};

/**
 * @summary Main class for the Dummy plugin.
 * @description The purpose of having a Dummy plugin is to exemplify
 * and document how plugins should be constructed in Hajk.
 * The plugins can also serve as a scaffold for other plugins: simply
 * copy the directory, rename it and all files within, and change logic
 * to create the plugin you want to.
 *
 * @class VTSearch
 * @extends {React.PureComponent}
 */

class VTSearch extends React.PureComponent {
  // Initialize state - this is the correct way of doing it nowadays.
  state = {
    expanded: false,
    activeSearchTool: searchTypes.DEFAULT,
    loading: false,
    appLoaded: false,
    draggingEnabled: true,
  };

  static propTypes = {
    app: PropTypes.object.isRequired,
    map: PropTypes.object.isRequired,
    options: PropTypes.object.isRequired,
  };

  static defaultProps = {
    options: {},
  };

  constructor(props) {
    super(props);
    this.type = "VTSearch"; // Special case - plugins that don't use BaseWindowPlugin must specify .type here
    this.localObserver = Observer();
    this.globalObserver = props.app.globalObserver;

    this.searchModel = new SearchModel({
      localObserver: this.localObserver,
      app: props.app,
      map: props.map,
      geoServer: props.options.geoServer,
      mapColors: props.options.mapColors,
    });

    this.mapViewModel = new MapViewModel({
      app: props.app,
      map: props.map,
      localObserver: this.localObserver,
      model: this.searchModel,
    });
    this.bindSubscriptions();
  }

  bindSubscriptions = () => {
    // Subscribes for an event when the vt-search has begun.
    this.localObserver.subscribe("vtsearch-result-begin", (label) => {
      this.setState({ loading: true });
    });

    this.localObserver.subscribe("vtsearch-result-done", (ans) => {
      this.setState({ loading: false });
    });

    this.localObserver.subscribe("vtsearch-chosen", (typeOfSearch) => {
      this.localObserver.publish("deactivate-search");
      this.setState({
        activeSearchTool: typeOfSearch,
        expanded: typeOfSearch === searchTypes.DEFAULT ? false : true,
      });
    });

    this.localObserver.subscribe("vtsearch-dragging-enabled", (enabled) => {
      this.setState({ draggingEnabled: enabled });
    });

    this.globalObserver.subscribe(
      "search.featureCollectionClicked",
      (searchResult) => {
        searchResult.type = searchResult?.source?.onClickName;

        const featureCollection = searchResult?.value;
        const attributesToDisplay =
          this.searchModel.geoServer[searchResult.type]?.attributesToDisplay;
        this.searchModel.updateDisplayFormat(
          featureCollection,
          attributesToDisplay
        );

        this.localObserver.publish("vtsearch-result-done", searchResult);
      }
    );

    this.globalObserver.subscribe("core.minimizeWindow", (title) => {
      if (title === this.props.options.title)
        this.globalObserver.publish("clear-autocomplete");
    });

    this.globalObserver.subscribe("core.closeWindow", (title) => {
      if (title === this.props.options.title)
        this.globalObserver.publish("clear-autocomplete");
    });
  };

  handleExpandClick = () => {
    this.setState({
      expanded: !this.state.expanded,
    });
  };

  handleChange = (e) => {
    var typeOfSearch = searchTypes[e.target.value];
    this.localObserver.publish("deactivate-search");
    this.setState({
      activeSearchTool: typeOfSearch,
      expanded: typeOfSearch === searchTypes.DEFAULT ? false : true,
    });
  };

  componentDidMount = () => {
    this.globalObserver.subscribe("core.appLoaded", () => {
      this.setState({
        appLoaded: true,
      });
    });
  };

  renderSearchmodule = () => {
    const { app } = this.props;
    switch (this.state.activeSearchTool) {
      case searchTypes.SEARCH: {
        this.props.app.appModel = this.props.app; // Gör så för att Sökmodellen laddas inte från ComponentDidMount.
        this.props.app.appLoadedFromRenderElsewhere = this.state.appLoaded;
        return (
          <Search
            map={this.props.app.getMap()}
            app={this.props.app}
            options={this.props.app.plugins.search.options} // FIXME: We should get config from somewhere else now when Search is part of Core
          ></Search>
        );
      }
      case searchTypes.JOURNEYS: {
        return (
          <Journeys
            model={this.searchModel}
            app={app}
            localObserver={this.localObserver}
          ></Journeys>
        );
      }
      case searchTypes.LINES: {
        return (
          <Lines
            model={this.searchModel}
            app={app}
            localObserver={this.localObserver}
          ></Lines>
        );
      }
      case searchTypes.STOPS: {
        return (
          <Stops
            model={this.searchModel}
            app={app}
            localObserver={this.localObserver}
          ></Stops>
        );
      }
      default: {
      }
    }
  };

  renderDropDown() {
    return (
      <StyledFormControl>
        <InputLabel id="search-type">SÖKALTERNATIV</InputLabel>
        <Select
          onChange={this.handleChange}
          native
          inputProps={{
            name: "searchType",
            id: "search-type",
          }}
        >
          {Object.keys(searchTypes).map((key) => {
            if (key === "DEFAULT")
              return <option key={key} value="" aria-label="None" />;
            return (
              <option key={key} value={key}>
                {searchTypes[key]}
              </option>
            );
          })}
        </Select>
      </StyledFormControl>
    );
  }

  renderExpansionButton() {
    return (
      <IconButton
        sx={{
          transform: this.state.expanded ? "rotate(180deg)" : "rotate(0deg)",
          transition: (theme) =>
            theme.transitions.create("transform", {
              duration: (theme) => theme.transitions.duration.shortest,
            }),
        }}
        onClick={this.handleExpandClick}
        aria-expanded={this.state.expanded}
        aria-label="show more"
        size="large"
      >
        <ExpandMoreIcon />
      </IconButton>
    );
  }

  renderMenuButton() {
    const { onMenuClick, menuButtonDisabled } = this.props;
    const tooltipText = menuButtonDisabled
      ? "Du måste först låsa upp verktygspanelen för kunna klicka på den här knappen. Tryck på hänglåset till vänster."
      : "Visa verktygspanelen";
    return (
      <Tooltip disableInteractive title={tooltipText}>
        <IconButton
          sx={{ padding: "7px" }}
          onClick={onMenuClick}
          disabled={menuButtonDisabled}
          aria-label="menu"
          size="large"
        >
          <MenuIcon />
        </IconButton>
      </Tooltip>
    );
  }

  renderLoader() {
    return this.state.loading ? <LinearProgress /> : null;
  }

  onClickSearchContainer = () => {
    this.localObserver.publish("vtsearch-clicked");
  };

  render() {
    const { app, options } = this.props;
    const { classes, children, ...baseWindowProps } = this.props; // BaseWindowPlugin can't handle content in classes.

    //OBS We need to keep the tooltip and IconButton to render menu!! //Tobias
    return (
      <BaseWindowPlugin
        {...baseWindowProps}
        type="vtsearch"
        custom={{
          icon: <SearchIcon />,
          title: "Title",
          description: "Description",
          height: "dynamic",
          width: 420,
          top: undefined,
          left: undefined,
          onWindowShow: this.onWindowShow,
          onWindowHide: this.onWindowHide,
          draggingEnabled: this.state.draggingEnabled,
        }}
      >
        <>
          {this.renderDropDown()}
          {this.renderSearchmodule()}
          <LoaderContainer>{this.renderLoader()}</LoaderContainer>
          {ReactDOM.createPortal(
            <SearchResultListContainer
              localObserver={this.localObserver}
              globalObserver={this.globalObserver}
              model={this.searchModel}
              toolConfig={options}
              app={app}
            ></SearchResultListContainer>,
            document.getElementById("windows-container")
          )}
        </>
      </BaseWindowPlugin>
    );
  }
}

export default VTSearch;

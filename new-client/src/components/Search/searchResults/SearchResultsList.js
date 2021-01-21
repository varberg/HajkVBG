import React from "react";
import { withStyles } from "@material-ui/core/styles";
import { withWidth, List, ListItem } from "@material-ui/core";
import SearchResultsDataset from "./SearchResultsDataset";
import SearchResultsDatasetSummary from "./SearchResultsDatasetSummary";

const styles = () => ({
  searchResultList: {
    padding: 0,
    width: "100%",
    transition: "none",
  },
  searchResultListItem: {
    width: "100%",
    display: "flex",
    padding: 0,
    transition: "none",
  },
});

class SearchResultsList extends React.PureComponent {
  constructor(props) {
    super(props);
    this.bindSubscriptions();
  }

  bindSubscriptions = () => {
    const { localObserver } = this.props;
    localObserver.subscribe(
      "searchResultList.clearAllSelectedFeatures",
      this.clearAllSelectedFeatures
    );
  };

  componentWillUnmount = () => {
    const { localObserver } = this.props;
    localObserver.unsubscribe("searchResultList.clearAllSelectedFeatures");
  };

  componentDidMount = () => {
    const { activeFeature } = this.props;
    //If the search results in exactly one hit (meaning that activeFeature is set on first render),
    // we activate it right a way.
    if (activeFeature) {
      this.handleSingleSearchResult();
    }
  };

  handleSingleSearchResult = () => {
    const {
      app,
      activeFeature,
      activeFeatureCollection,
      localObserver,
      getFeatureTitle,
      addFeatureToSelected,
    } = this.props;

    if (activeFeature.onClickName) {
      app.globalObserver.publish(
        `search.featureClicked.${activeFeature.onClickName}`,
        activeFeature
      );
    } else {
      const source = activeFeatureCollection?.source;
      const featureTitle = getFeatureTitle(activeFeature, source);

      activeFeature.source = source;
      addFeatureToSelected({
        feature: activeFeature,
        sourceId: source?.id,
        featureTitle: featureTitle,
        initiator: "showDetails",
      });
      if (this.props.width === "xs" || this.props.width === "sm") {
        localObserver.publish("minimizeSearchResultList");
      }
      localObserver.publish("map.addAndHighlightFeatureInSearchResultLayer", {
        feature: activeFeature,
        featureTitle: featureTitle,
      });
    }
  };

  handleOnFeatureClick = (feature) => {
    const { app, setActiveFeature } = this.props;
    if (feature.onClickName) {
      app.globalObserver.publish(
        `search.featureClicked.${feature.onClickName}`,
        feature
      );
    } else {
      setActiveFeature(feature);
    }
  };

  handleOnFeatureKeyPress = (event, feature) => {
    if (event.which === 13 || event.keyCode === 13) {
      this.handleOnFeatureClick(feature);
    }
  };

  clearAllSelectedFeatures = () => {
    const { localObserver, activeFeatureCollection } = this.props;
    const sourceId = activeFeatureCollection?.source?.id;

    const selectedItems =
      !sourceId || sourceId === "userSelected"
        ? []
        : [...this.state.selectedItems].filter((selectedItem) => {
            return selectedItem.sourceId !== sourceId;
          });
    //handleSelectedListClear(selectedItems);
    // Remove all selected items from array, then publish to
    // mapViewModel to reset style (clearing highlight).
    this.setState({ selectedItems: selectedItems }, () => {
      localObserver.publish("map.highlightFeaturesByIds", selectedItems);
    });
  };

  renderSearchResultDatasetSummary = (featureCollection) => {
    const { getOriginBasedIcon } = this.props;
    return (
      <SearchResultsDatasetSummary
        featureCollection={featureCollection}
        getOriginBasedIcon={getOriginBasedIcon}
      />
    );
  };

  renderSearchResultDataset = (featureCollection) => {
    const {
      getOriginBasedIcon,
      app,
      activeFeatureCollection,
      activeFeature,
      setActiveFeature,
      handleFeatureCollectionClick,
      featureFilter,
      featureSortingStrategy,
      enableFeaturePreview,
      getFeatureTitle,
      localObserver,
      enableFeatureToggler,
      selectedFeatures,
      addFeatureToSelected,
      removeFeatureFromSelected,
    } = this.props;
    return (
      <SearchResultsDataset
        app={app}
        featureCollection={featureCollection}
        getOriginBasedIcon={getOriginBasedIcon}
        selectedFeatures={selectedFeatures}
        activeFeatureCollection={activeFeatureCollection}
        activeFeature={activeFeature}
        handleFeatureCollectionClick={handleFeatureCollectionClick}
        setActiveFeature={setActiveFeature}
        handleOnFeatureClick={this.handleOnFeatureClick}
        handleOnFeatureKeyPress={this.handleOnFeatureKeyPress}
        featureFilter={featureFilter}
        featureSortingStrategy={featureSortingStrategy}
        enableFeaturePreview={enableFeaturePreview}
        getFeatureTitle={getFeatureTitle}
        localObserver={localObserver}
        enableFeatureToggler={enableFeatureToggler}
        addFeatureToSelected={addFeatureToSelected}
        removeFeatureFromSelected={removeFeatureFromSelected}
      />
    );
  };

  renderSearchResultList = () => {
    const {
      featureCollections,
      classes,
      handleFeatureCollectionClick,
    } = this.props;
    return (
      <List className={classes.searchResultList}>
        {featureCollections.map((featureCollection) => (
          <ListItem
            disableTouchRipple
            key={featureCollection.source.id}
            className={classes.searchResultListItem}
            id={`search-result-dataset-${featureCollection.source.id}`}
            aria-controls={`search-result-dataset-details-${featureCollection.source.id}`}
            onClick={() => handleFeatureCollectionClick(featureCollection)}
            button
            divider
          >
            {this.renderSearchResultDatasetSummary(featureCollection)}
          </ListItem>
        ))}
      </List>
    );
  };

  render() {
    const { activeFeatureCollection } = this.props;

    return activeFeatureCollection
      ? this.renderSearchResultDataset(activeFeatureCollection)
      : this.renderSearchResultList();
  }
}

export default withStyles(styles)(withWidth()(SearchResultsList));

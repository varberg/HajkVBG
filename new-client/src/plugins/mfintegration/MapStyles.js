//default, non admin configurable style values.

const defaultStrokeWidth = 4;
const defaultCircleRadius = 6;
const defaultStrokeWithCircle = 2;

//used when a search box is being drawn (not for the search results themselves).
const drawSearchStrokeColor = "rgba(74,74,150,0.5)";
const drawSearchFillColor = "rgba(255,255,255,0.07)";

const snapStrokeColor = "rgba(74,74,74,0.5)";
const snapFillColor = "rgba(74,74,74,0.07)";

export const createMapStyles = (options) => {
  const listFeatureStyle = createListFeatureStyle(options);
  const selectedListFeatureStyle = createSelectedListFeatureStyle(options);
  const unsavedFeatureStyle = createUnsavedFeatureStyle(options);
  const editFeatureStyle = createEditFeatureStyle(options);
  const snapStyle = createSnapStyle();
  const drawSearchStyle = createDrawSearchStyle();

  return {
    listFeatureStyle: listFeatureStyle,
    selectedListFeatureStyle: selectedListFeatureStyle,
    unsavedFeatureStyle: unsavedFeatureStyle,
    editFeatureStyle: editFeatureStyle,
    snapStyle: snapStyle,
    drawSearchStyle: drawSearchStyle,
  };
};

const createListFeatureStyle = (options) => {
  const strokeColor = options.listFeatureStrokeColor;
  const fillColor = options.listFeatureFillColor;
  return {
    stroke: { color: strokeColor, width: defaultStrokeWidth },
    fill: { color: fillColor },
    circle: { radius: defaultCircleRadius, width: defaultStrokeWithCircle },
  };
};

const createSelectedListFeatureStyle = (options) => {
  const strokeColor = options.selectedListFeatureStrokeColor;
  const fillColor = options.selectedListFeatureFillColor;
  return {
    stroke: { color: strokeColor, width: defaultStrokeWidth },
    fill: { color: fillColor },
    circle: { radius: defaultCircleRadius, width: defaultStrokeWithCircle },
  };
};

const createUnsavedFeatureStyle = (options) => {
  const strokeColor = options.unsavedFeatureStrokeColor;
  const fillColor = options.unsavedFeatureFillColor;
  return {
    stroke: { color: strokeColor, width: defaultStrokeWidth },
    fill: { color: fillColor },
    circle: { radius: defaultCircleRadius, width: defaultStrokeWithCircle },
  };
};

const createEditFeatureStyle = (options) => {
  const strokeColor = options.editFeatureStrokeColor;
  const fillColor = options.editFeatureFillColor;
  return {
    stroke: { color: strokeColor, width: defaultStrokeWidth },
    fill: { color: fillColor },
    circle: { radius: defaultCircleRadius, width: defaultStrokeWithCircle },
  };
};

const createSnapStyle = () => {
  const strokeColor = snapStrokeColor;
  const fillColor = snapFillColor;
  return {
    stroke: { color: strokeColor, width: defaultStrokeWidth },
    fill: { color: fillColor },
    circle: { radius: defaultCircleRadius, width: defaultStrokeWithCircle },
  };
};

/* Styles for search */
const createDrawSearchStyle = () => {
  const strokeColor = drawSearchStrokeColor;
  const fillColor = drawSearchFillColor;
  return {
    stroke: { color: strokeColor, width: defaultStrokeWidth },
    fill: { color: fillColor },
    circle: { radius: defaultCircleRadius, width: defaultStrokeWithCircle },
  };
};

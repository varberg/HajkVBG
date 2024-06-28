import AppModel from "models/AppModel";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import GeoJSON from "ol/format/GeoJSON.js";
import GeoTIFFSource from "ol/source/GeoTIFF";
import TileLayer from "ol/layer/WebGLTile.js";

class LayerController {
  #vectorSource = null;
  #vectorLayer = null;
  #geoTiffLayer = null;
  constructor() {
    this.map = AppModel.map;
  }

  /**
   * Returns the vector source.
   * If the vector source is not initialized, it creates a new vector source and sets it.
   * @returns {VectorSource} The vector source.
   */
  get vectorSource() {
    if (!this.#vectorSource) {
      this.#vectorSource = new VectorSource({ wrapX: false });
    }
    return this.#vectorSource;
  }

  /**
   * Returns the vector layer.
   * If the vector layer is not initialized, it creates a new vector layer and sets it.
   * It will also add the vector layer to the map.
   * @returns {VectorLayer} The vector layer.
   */
  get vectorLayer() {
    if (!this.#vectorLayer) {
      this.#vectorLayer = new VectorLayer({
        source: this.vectorSource,
        // style: styleFunction,
      });
      // this.map.addLayer(currentVectorLayer);
      this.#vectorLayer.setMap(this.map);
    }
    return this.#vectorLayer;
  }

  clearVectorSource() {
    if (this.#vectorSource) {
      this.vectorSource.clear();
    }
  }

  clearTiffSource() {
    if (this.#geoTiffLayer) {
      this.geoTiffLayer.setSource(null);
    }
  }

  /**
   * Returns the GeoTIFF layer.
   *
   * @return {TileLayer} The GeoTIFF layer.
   */
  get geoTiffLayer() {
    if (!this.#geoTiffLayer) {
      this.#geoTiffLayer = new TileLayer();
      this.#geoTiffLayer.setMap(this.map);
    }
    return this.#geoTiffLayer;
  }

  /**
   * Apply JSON data to the vector layer.
   *
   * @param {Object} results - The results containing GeoJSON data.
   */
  applyJsonData(results) {
    // We assume that the results are GeoJSON, this is required.
    // Convert projection if necessary
    const features = new GeoJSON().readFeatures(results.data, {
      featureProjection: this.map.getView().getProjection(),
    });

    // Clear the vector source
    this.clearVectorSource();

    // Add the retrieved features to the vector source
    // TIP: If you get an error here when running addFeatures, about something "function getExtent() does not exist".
    // Its probably malformed GeoJson. Check your incoming data.
    this.vectorSource.addFeatures(features);
    this.fitMapToExtent(this.vectorLayer);
  }

  /**
   * Sets the source of the GeoTIFF layer using the provided results data.
   *
   * @param {Object} results - The results containing GeoTIFF data.
   */
  applyTiffData(results) {
    this.clearTiffSource();
    this.geoTiffLayer.setSource(
      new GeoTIFFSource({
        sources: [
          {
            blob: results.data,
          },
        ],
      })
    );
    // Right now its a mystery on how to get the extent of the GeoTIFF and zoom to it....
    // Well, it's not a mystery, its probably just tricky and will need geotiff.js library.
    // Not worth the effort right now.
    // this.fitMapToExtent(this.geoTiffLayer);
  }

  /**
   * Fit the map view to the extent of the layer.
   * currently only works for vector layers.
   * @param {type} layer - The layer to fit the map view to its extent
   */
  fitMapToExtent(layer) {
    // Fit the map view to the extent of the layer
    // Currently only works for vector layers
    this.map.getView().fit(layer.getSource().getExtent(), {
      size: this.map.getSize(),
      padding: [50, 50, 50, 50],
      duration: 500,
    });
  }

  /**
   * Apply result data to the map.
   *
   * @param {Object} results - The results to apply to the map.
   */
  applyResultDataToMap(results) {
    // Here we rely on the results to determine the type of data to apply
    // The function call is dynamic based on the results type
    // For example, if the results are Json, we use the applyJsonData function
    // The supported type are already defined and verified in the FmeAppsService class.
    let type = results.simpleContentType;
    type = type.charAt(0).toUpperCase() + type.slice(1);
    this[`apply${type}Data`](results);
    type = null;
  }
}

export default LayerController;

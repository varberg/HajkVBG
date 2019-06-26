import OLCesium from "olcs/OLCesium.js";

class DummyModel {
  constructor(settings) {
    this.map = settings.map;
    this.app = settings.app;
    this.localObserver = settings.localObserver;

    // Setup Cesium
    this.ol3d = new OLCesium({
      map: this.map
    });
  }

  getMap() {
    return this.map;
  }

  toggle3d() {
    console.log(
      `Toggeling Cesium ${this.ol3d.getEnabled() === true ? "off" : "on"}.`,
      this.ol3d
    );
    this.ol3d.setEnabled(!this.ol3d.getEnabled());
  }
}

export default DummyModel;

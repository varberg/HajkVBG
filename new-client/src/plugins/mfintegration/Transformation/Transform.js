import Polygon from "ol/geom/Polygon";
import Point from "ol/geom/Point";

export default class Transform {
  createGeometry = (type, coordinates) => {
    if (type === "Point") return this.createPoint(coordinates);
    if (type === "Polygon") return this.createPolygon(coordinates);
  };

  createPoint = (coordinates) => {
    return new Point(coordinates);
  };

  createPolygon = (coordinates) => {
    return new Polygon(coordinates);
  };

  createTransformationRelationships = (fromEpsg, toEpsg) => {
    if (fromEpsg === toEpsg) return null;
    return {
      fromSrs: fromEpsg,
      toSrs: toEpsg,
    };
  };

  transformGeometry = (geometry, fromEpsg, toEpsg) => {
    return geometry.transform(fromEpsg, toEpsg);
  };
}

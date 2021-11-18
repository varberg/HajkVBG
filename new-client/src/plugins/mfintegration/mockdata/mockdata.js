/* 
Mock data for developing UI without receiving data from EDP.
*/

const REAL_ESTATE_MOCK = [
  { id: 1, name: "Fastighet 1", info: "information om Fastighet 1" },
  { id: 2, name: "Fastighet 2", info: "information om Fastighet 2" },
  { id: 3, name: "Fastighet 3", info: "information om Fastighet 3" },
];
const COORDINATE_MOCK = [];
const GEOMETRY_MOCK = [];
const CONTROL_OBJECT_MOCK = [];

export const getMockData = (mode) => {
  switch (mode) {
    case "realEstate":
      return REAL_ESTATE_MOCK;
    case "coordinate":
      return COORDINATE_MOCK;
    case "geometry":
      return GEOMETRY_MOCK;
    case "controlObject":
      return CONTROL_OBJECT_MOCK;
    default:
      return [];
  }
};

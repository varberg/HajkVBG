/* 
Mock data for developing UI without receiving data from EDP.
*/
const REAL_ESTATE_MOCK = createMockRealEstateList(15);
const COORDINATE_MOCK = [];
const GEOMETRY_MOCK = [];
const CONTROL_OBJECT_MOCK = [];

function createMockRealEstateList(numberOfRealEstates) {
  let realEstateList = [];

  for (let i = 0; i < numberOfRealEstates; i++) {
    realEstateList.push({
      id: i + 1,
      fnr: "140034431",
      name: `Högsbo 22:2`,
      municipality: "Göteborg",
      information: `Information om fastighet ${i + 1}`,
    });
  }

  return realEstateList;
}

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

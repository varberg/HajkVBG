export const drawingSupportLayers = () => {
  return {
    realEstate: "o83amu",
    coordinate: null,
    area: null,
    survey: null,
    contamination: null,
  };
};

export const drawingSupportLayersArray = () => {
  const supportLayers = drawingSupportLayers();

  let answer = [];
  Object.keys(supportLayers).forEach((key) => {
    if (supportLayers[key])
      answer.push({ sourceName: key, layerId: supportLayers[key] });
  });

  for (let i = 0; i < answer.length; i++) {
    if (answer[i].sourceName === "realEstate") answer[i].name = "Fastigheter";
    if (answer[i].sourceName === "coordinate") answer[i].name = "Koordinater";
    if (answer[i].sourceName === "area") answer[i].name = "Områden";
    if (answer[i].sourceName === "survey") answer[i].name = "Undersökningar";
    if (answer[i].sourceName === "contamination")
      answer[i].name = "Föroreningar";
  }
  return answer;
};

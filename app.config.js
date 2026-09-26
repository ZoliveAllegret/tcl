const app = require("./app.json");

/** Base du site uniquement pour l'export Pages (EXPO_BASE_URL=/tcl). */
module.exports = () => {
  const baseUrl = process.env.EXPO_BASE_URL;
  const expo = {
    ...app.expo,
    experiments: { ...app.expo.experiments },
  };
  if (baseUrl) {
    expo.experiments.baseUrl = baseUrl;
  }
  return { expo };
};

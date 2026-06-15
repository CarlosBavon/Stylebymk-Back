const serviceDurations = {
  'Cornrows': 90,
  'Twists': 120,
  'Barrel Twists': 120,
  'Locs (Dreadlocks)': 150,
};

const getDuration = (service) => serviceDurations[service] || 90;

module.exports = { getDuration };
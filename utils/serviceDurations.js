const serviceDurations = {
  'Cornrows': 90,
  'Natural twists': 120,
  'Barrel Twists': 180,
  'Artificial locs!': 150,
};

const getDuration = (service) => serviceDurations[service] || 90;

module.exports = { getDuration };
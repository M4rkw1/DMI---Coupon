// Safari does not provide a reliable iPhone model identifier. This is a
// conservative screen-shape heuristic, not proof of model identity.
// Apple's published Duo panels have short/long ratios of 1398/2034 and
// 1878/2670. Use screen dimensions so keyboards, browser chrome, rotation
// and split windows do not change the choice. The menu offers an override.
export function prefersDuoNavigation({ userAgent = '', width, height } = {}) {
  if (!/iPhone/i.test(userAgent) || !Number.isFinite(width) || !Number.isFinite(height)) return false;
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  const ratio = short / long;
  return short >= 350 && long <= 1100 && ratio >= 0.675 && ratio <= 0.715;
}

export function navigationPreference(value) {
  return ['auto', 'right', 'standard'].includes(value) ? value : 'auto';
}

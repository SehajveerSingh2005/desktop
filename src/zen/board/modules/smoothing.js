// smoothing.js

function getAveragePoint(points, startIndex, endIndex) {
  const window = points.slice(startIndex, endIndex);
  if (window.length === 0) return { x: 0, y: 0 };

  const total = window.reduce((acc, point) => {
    acc.x += point.x;
    acc.y += point.y;
    return acc;
  }, { x: 0, y: 0 });

  return {
    x: total.x / window.length,
    y: total.y / window.length,
  };
}

export function smoothPoints(points) {
  const smoothed = [];
  const windowSize = 4;
  if (points.length < 2) {
    return [...points];
  }
  for (let i = 0; i < points.length; i++) {
      const startIndex = Math.max(0, i - windowSize);
      const endIndex = Math.min(points.length, i + windowSize + 1);
      smoothed.push(getAveragePoint(points, startIndex, endIndex));
  }
  return smoothed;
}

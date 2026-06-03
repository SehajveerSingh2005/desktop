// smoothing.js

export function smoothPoints(points, existingSmoothed = null) {
  const N = points.length / 2; // number of points in the flat array
  if (N < 2) {
    return [...points];
  }

  const windowSize = 4;
  const recomputeStart = existingSmoothed ? Math.max(0, N - 1 - windowSize) : 0;

  let smoothed;
  if (existingSmoothed) {
    smoothed = existingSmoothed;
    if (smoothed.length > recomputeStart * 2) {
      smoothed.length = recomputeStart * 2;
    }
  } else {
    smoothed = new Array(N * 2);
  }

  for (let i = recomputeStart; i < N; i++) {
    const startIndex = Math.max(0, i - windowSize);
    const endIndex = Math.min(N, i + windowSize + 1);

    const len = endIndex - startIndex;
    let totalX = 0;
    let totalY = 0;
    for (let j = startIndex; j < endIndex; j++) {
      totalX += points[j * 2];
      totalY += points[j * 2 + 1];
    }

    const avgX = totalX / len;
    const avgY = totalY / len;
    if (existingSmoothed) {
      smoothed.push(avgX, avgY);
    } else {
      smoothed[i * 2] = avgX;
      smoothed[i * 2 + 1] = avgY;
    }
  }

  return smoothed;
}
